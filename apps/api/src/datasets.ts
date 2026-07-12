import fs from "node:fs";
import path from "node:path";
import type { DatasetVersion } from "@world-trade/shared";
import type { YearInfo } from "@world-trade/shared/api";
import { HS_CHAPTERS } from "@world-trade/shared/hs-chapters";
import { PARQUET_DIR, REMOTE_DATA, exec } from "./db.ts";

/** Public data release; overridable so a new release is just an env change. */
const DEFAULT_REMOTE_BASE =
  "https://github.com/phbelov/world-trade-app/releases/download/data-v1";

export interface Catalog {
  datasets: DatasetVersion[];
  years: YearInfo[];
  /** Latest reconciled year — the default UI selection. */
  defaultYear: number;
  /** True when a provisional (Comtrade) dataset is mounted. */
  hasProvisional: boolean;
  /** SQL source expression for one reconciled year of HS6 facts. */
  factsExprForYear: (year: number) => string;
}

let catalog: Catalog | null = null;

export function getCatalog(): Catalog {
  if (!catalog) throw new Error("catalog not initialized");
  return catalog;
}

/**
 * Where Parquet lives and how to address it.
 *
 * Local: the ingest pipeline's hive layout on disk.
 * Remote: flat files on a static host (GitHub release assets have no
 * directories), each cube consolidated to one all-years file with the year
 * column baked in — so both sources expose identical column shapes.
 */
interface DataSource {
  manifests(): Promise<DatasetVersion[]>;
  /** Table expression for a cube, including a `year` column. */
  cube(datasetId: string, name: string): string;
  /** Table expression for one year of full-grain facts. */
  facts(datasetId: string, year: number): string;
  dim(datasetId: string, name: string): string;
}

const localSource: DataSource = {
  async manifests() {
    if (!fs.existsSync(PARQUET_DIR)) {
      throw new Error(
        `No data at ${PARQUET_DIR} — run the ingest pipeline first (see README)`,
      );
    }
    return fs
      .readdirSync(PARQUET_DIR)
      .map((dir) => path.join(PARQUET_DIR, dir, "manifest.json"))
      .filter((p) => fs.existsSync(p))
      .map((p) => JSON.parse(fs.readFileSync(p, "utf8")) as DatasetVersion);
  },
  cube: (id, name) =>
    `read_parquet('${path.join(PARQUET_DIR, id, "cubes", name, "*", "*.parquet")}', hive_partitioning = true)`,
  facts: (id, year) =>
    `read_parquet('${path.join(PARQUET_DIR, id, "facts", `year=${year}`, "*.parquet")}')`,
  dim: (id, name) =>
    `read_parquet('${path.join(PARQUET_DIR, id, "dims", `${name}.parquet`)}')`,
};

function remoteSource(base: string): DataSource {
  return {
    async manifests() {
      const res = await fetch(`${base}/datasets.json`);
      if (!res.ok) {
        throw new Error(`failed to fetch ${base}/datasets.json: ${res.status}`);
      }
      return (await res.json()) as DatasetVersion[];
    },
    cube: (id, name) => `read_parquet('${base}/cube-${id}-${name}.parquet')`,
    facts: (id, year) => `read_parquet('${base}/facts-${id}-${year}.parquet')`,
    dim: (id, name) => `read_parquet('${base}/dims-${id}-${name}.parquet')`,
  };
}

/**
 * Discover dataset manifests and create unified views: reconciled BACI years
 * plus (when present) provisional Comtrade years, each row carrying a
 * `provisional` flag. Cubes that only exist for reconciled data (metrics,
 * dependencies, HS4) are exposed as BACI-only views.
 */
export async function initCatalog(): Promise<Catalog> {
  const source: DataSource = REMOTE_DATA
    ? remoteSource(process.env.WT_DATA_BASE_URL ?? DEFAULT_REMOTE_BASE)
    : localSource;

  const datasets = await source.manifests();
  const baci = datasets.find((d) => d.provider === "baci");
  if (!baci) throw new Error("BACI dataset missing — run `pnpm ingest baci:all`");
  const provisional = datasets.find(
    (d) => d.provider === "comtrade" && d.provisional,
  );

  await exec(`
    CREATE OR REPLACE VIEW dim_countries AS
    SELECT * FROM ${source.dim(baci.id, "countries")}
  `);
  await exec(`
    CREATE OR REPLACE VIEW dim_products AS
    SELECT * FROM ${source.dim(baci.id, "products")}
  `);
  await exec(`
    CREATE OR REPLACE VIEW dim_chapters AS
    SELECT DISTINCT hs2, coalesce(section, 'other') AS section,
           coalesce(section_name, 'Unspecified') AS section_name
    FROM dim_products
  `);
  const chapterValues = Object.entries(HS_CHAPTERS)
    .map(([code, name]) => `('${code}', '${name.replace(/'/g, "''")}')`)
    .join(",\n      ");
  await exec(`
    CREATE OR REPLACE VIEW dim_chapter_names AS
    SELECT * FROM (VALUES
      ${chapterValues}
    ) AS t(hs2, chapter_name)
  `);

  const baciCube = (name: string) => source.cube(baci.id, name);
  const provCube = (name: string) =>
    provisional ? source.cube(provisional.id, name) : null;

  const totalsProv = provCube("country_totals");
  await exec(`
    CREATE OR REPLACE VIEW v_country_totals AS
    SELECT year, country, exports_usd, imports_usd,
           export_partners, import_partners,
           false AS provisional, NULL AS exports_source
    FROM ${baciCube("country_totals")}
    ${
      totalsProv
        ? `UNION ALL
    SELECT year, country, exports_usd, imports_usd,
           export_partners, import_partners,
           true, exports_source
    FROM ${totalsProv}`
        : ""
    }
  `);

  const bilateralProv = provCube("bilateral");
  await exec(`
    CREATE OR REPLACE VIEW v_bilateral AS
    SELECT year, exporter, importer, value_usd, false AS provisional
    FROM ${baciCube("bilateral")}
    ${
      bilateralProv
        ? `UNION ALL
    SELECT year, exporter, importer, value_usd, true FROM ${bilateralProv}`
        : ""
    }
  `);

  const hs2Prov = provCube("country_flow_hs2");
  await exec(`
    CREATE OR REPLACE VIEW v_country_flow_hs2 AS
    SELECT year, country, flow, hs2, value_usd, false AS provisional
    FROM ${baciCube("country_flow_hs2")}
    ${
      hs2Prov
        ? `UNION ALL
    SELECT year, country, flow, hs2, value_usd, true FROM ${hs2Prov}`
        : ""
    }
  `);

  const bilateralHs2Prov = provCube("bilateral_hs2");
  await exec(`
    CREATE OR REPLACE VIEW v_bilateral_hs2 AS
    SELECT year, exporter, importer, hs2, value_usd, false AS provisional
    FROM ${baciCube("bilateral_hs2")}
    ${
      bilateralHs2Prov
        ? `UNION ALL
    SELECT year, exporter, importer, hs2, value_usd, true FROM ${bilateralHs2Prov}`
        : ""
    }
  `);
  await exec(`
    CREATE OR REPLACE VIEW v_country_flow_hs4 AS
    SELECT * FROM ${baciCube("country_flow_hs4")}
  `);
  await exec(`
    CREATE OR REPLACE VIEW v_product_world AS
    SELECT * FROM ${baciCube("product_world")}
  `);
  await exec(`
    CREATE OR REPLACE VIEW v_metrics_country AS
    SELECT * FROM ${baciCube("metrics_country")}
  `);
  await exec(`
    CREATE OR REPLACE VIEW v_import_dependency AS
    SELECT * FROM ${baciCube("import_dependency")}
  `);

  const years: YearInfo[] = [];
  for (let y = baci.firstYear; y <= baci.lastYear; y++) {
    years.push({ year: y, provisional: false });
  }
  if (provisional) {
    for (let y = provisional.firstYear; y <= provisional.lastYear; y++) {
      if (y > baci.lastYear) years.push({ year: y, provisional: true });
    }
  }

  catalog = {
    datasets,
    years,
    defaultYear: baci.lastYear,
    hasProvisional: Boolean(provisional),
    factsExprForYear: (year: number) => source.facts(baci.id, year),
  };
  return catalog;
}
