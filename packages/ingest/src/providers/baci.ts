import fs from "node:fs";
import path from "node:path";
import { HS_SECTIONS } from "@world-trade/shared/hs-sections";
import type { DatasetVersion } from "@world-trade/shared";
import {
  BACI_DATASET_ID,
  BACI_RELEASE,
  BACI_ZIP,
  SCRATCH_DIR,
  datasetDir,
} from "../config.ts";
import { withDuck, type Duck } from "../duck.ts";
import { extractEntryTo, listZipEntries } from "../zip.ts";

const YEAR_ENTRY = new RegExp(`^BACI_HS92_Y(\\d{4})_V${BACI_RELEASE}\\.csv$`);
const COUNTRY_ENTRY = `country_codes_V${BACI_RELEASE}.csv`;
const PRODUCT_ENTRY = `product_codes_HS92_V${BACI_RELEASE}.csv`;

interface YearEntry {
  entry: string;
  year: number;
}

export function baciYearEntries(): YearEntry[] {
  return listZipEntries(BACI_ZIP)
    .map((entry) => {
      const m = YEAR_ENTRY.exec(entry);
      return m ? { entry, year: Number(m[1]) } : null;
    })
    .filter((e): e is YearEntry => e !== null)
    .sort((a, b) => a.year - b.year);
}

/** BACI columns: t=year, i=exporter, j=importer, k=HS6, v=value (k USD), q=tonnes. */
const FACTS_SELECT = (csvPath: string) => `
  SELECT
    CAST(t AS SMALLINT)                                       AS year,
    CAST(i AS INTEGER)                                        AS exporter,
    CAST(j AS INTEGER)                                        AS importer,
    lpad(trim(k), 6, '0')                                     AS hs6,
    CAST(v AS DOUBLE) * 1000.0                                AS value_usd,
    TRY_CAST(nullif(nullif(trim(q), ''), 'NA') AS DOUBLE)     AS quantity_tonnes
  FROM read_csv('${csvPath}', header = true, all_varchar = true)
`;

async function assertExpectedColumns(db: Duck, csvPath: string): Promise<void> {
  const rows = await db.query<{ column_name: string }>(
    `DESCRIBE SELECT * FROM read_csv('${csvPath}', header = true, all_varchar = true)`,
  );
  const cols = rows.map((r) => r.column_name);
  for (const expected of ["t", "i", "j", "k", "v", "q"]) {
    if (!cols.includes(expected)) {
      throw new Error(
        `BACI schema drift: expected column "${expected}", found [${cols.join(", ")}]. ` +
          `Upstream release format changed — update the adapter.`,
      );
    }
  }
}

export async function ingestBaciFacts(years?: number[]): Promise<void> {
  const entries = baciYearEntries().filter(
    (e) => !years || years.includes(e.year),
  );
  if (entries.length === 0) throw new Error("No BACI year files found in zip");

  const outRoot = path.join(datasetDir(BACI_DATASET_ID), "facts");
  await withDuck(async (db) => {
    let checkedSchema = false;
    for (const { entry, year } of entries) {
      const t0 = Date.now();
      const tmpCsv = path.join(SCRATCH_DIR, entry);
      await extractEntryTo(BACI_ZIP, entry, tmpCsv);
      try {
        if (!checkedSchema) {
          await assertExpectedColumns(db, tmpCsv);
          checkedSchema = true;
        }
        const outDir = path.join(outRoot, `year=${year}`);
        await fs.promises.mkdir(outDir, { recursive: true });
        const outFile = path.join(outDir, "data.parquet");
        await db.exec(
          `COPY (${FACTS_SELECT(tmpCsv)}) TO '${outFile}' (FORMAT parquet, COMPRESSION zstd)`,
        );
        const [{ n }] = (await db.query<{ n: bigint }>(
          `SELECT count(*) AS n FROM read_parquet('${outFile}')`,
        )) as [{ n: bigint }];
        console.log(
          `facts year=${year}: ${Number(n).toLocaleString()} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
        );
      } finally {
        await fs.promises.rm(tmpCsv, { force: true });
      }
    }
  });

  const manifest: DatasetVersion & { ingestedAt: string } = {
    id: BACI_DATASET_ID,
    provider: "baci",
    classification: "HS92",
    releasedAt: "2026-01-22",
    firstYear: entries[0]!.year,
    lastYear: entries[entries.length - 1]!.year,
    reconciled: true,
    provisional: false,
    ingestedAt: new Date().toISOString(),
  };
  await fs.promises.writeFile(
    path.join(datasetDir(BACI_DATASET_ID), "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}

/** Pick the first matching column name, tolerating BACI header drift across releases. */
function pick(cols: string[], candidates: string[], what: string): string {
  const found = candidates.find((c) => cols.includes(c));
  if (!found) {
    throw new Error(
      `BACI dims: no ${what} column among [${cols.join(", ")}] (tried ${candidates.join(", ")})`,
    );
  }
  return found;
}

export async function ingestBaciDims(): Promise<void> {
  const dimsDir = path.join(datasetDir(BACI_DATASET_ID), "dims");
  await fs.promises.mkdir(dimsDir, { recursive: true });
  const tmpCountries = path.join(SCRATCH_DIR, COUNTRY_ENTRY);
  const tmpProducts = path.join(SCRATCH_DIR, PRODUCT_ENTRY);
  await extractEntryTo(BACI_ZIP, COUNTRY_ENTRY, tmpCountries);
  await extractEntryTo(BACI_ZIP, PRODUCT_ENTRY, tmpProducts);

  try {
    await withDuck(async (db) => {
      const cCols = (
        await db.query<{ column_name: string }>(
          `DESCRIBE SELECT * FROM read_csv('${tmpCountries}', header = true, all_varchar = true)`,
        )
      ).map((r) => r.column_name);
      const code = pick(cCols, ["country_code"], "code");
      const name = pick(cCols, ["country_name", "country_name_full"], "name");
      const iso2 = pick(cCols, ["country_iso2", "iso_2digit_alpha"], "iso2");
      const iso3 = pick(cCols, ["country_iso3", "iso_3digit_alpha"], "iso3");
      // BACI names historical entities like "Sudan (...2011)". ISO3 is NOT
      // unique: the current and predecessor entities share it, with disjoint
      // year coverage in the facts. The UI keys countries on ISO3 and unions
      // the codes' series; valid_until drives entity-change annotations.
      await db.exec(`
        COPY (
          SELECT
            CAST(${code} AS INTEGER)      AS code,
            trim(${name})                 AS name,
            regexp_replace(trim(${name}), ' ?\\(\\.\\.\\.\\d{4}\\)', '')
                                          AS display_name,
            TRY_CAST(regexp_extract(trim(${name}), '\\(\\.\\.\\.(\\d{4})\\)', 1) AS INTEGER)
                                          AS valid_until,
            nullif(trim(${iso2}), '')     AS iso2,
            trim(${iso3})                 AS iso3
          FROM read_csv('${tmpCountries}', header = true, all_varchar = true)
          ORDER BY code
        ) TO '${path.join(dimsDir, "countries.parquet")}' (FORMAT parquet, COMPRESSION zstd)
      `);

      const pCols = (
        await db.query<{ column_name: string }>(
          `DESCRIBE SELECT * FROM read_csv('${tmpProducts}', header = true, all_varchar = true)`,
        )
      ).map((r) => r.column_name);
      const pCode = pick(pCols, ["code"], "code");
      const pDesc = pick(pCols, ["description"], "description");
      const sectionValues = HS_SECTIONS.flatMap((s) =>
        s.chapters.map(
          ([lo, hi]) => `(${lo}, ${hi}, '${s.id}', '${s.name.replace(/'/g, "''")}')`,
        ),
      ).join(",\n            ");
      await db.exec(`
        COPY (
          WITH sections(lo, hi, section, section_name) AS (
            VALUES
            ${sectionValues}
          )
          SELECT
            lpad(trim(p.${pCode}), 6, '0')            AS hs6,
            substr(lpad(trim(p.${pCode}), 6, '0'), 1, 4) AS hs4,
            substr(lpad(trim(p.${pCode}), 6, '0'), 1, 2) AS hs2,
            s.section,
            s.section_name,
            trim(p.${pDesc})                          AS name
          FROM read_csv('${tmpProducts}', header = true, all_varchar = true) p
          LEFT JOIN sections s
            ON TRY_CAST(substr(lpad(trim(p.${pCode}), 6, '0'), 1, 2) AS INTEGER)
               BETWEEN s.lo AND s.hi
          ORDER BY hs6
        ) TO '${path.join(dimsDir, "products.parquet")}' (FORMAT parquet, COMPRESSION zstd)
      `);
    });
  } finally {
    await fs.promises.rm(tmpCountries, { force: true });
    await fs.promises.rm(tmpProducts, { force: true });
  }
  console.log(`dims written to ${dimsDir}`);
}
