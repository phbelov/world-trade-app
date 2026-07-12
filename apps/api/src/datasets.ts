import fs from "node:fs";
import path from "node:path";
import type { DatasetVersion } from "@world-trade/shared";
import type { YearInfo } from "@world-trade/shared/api";
import { PARQUET_DIR, exec } from "./db.ts";

export interface Catalog {
  datasets: DatasetVersion[];
  years: YearInfo[];
  /** Latest reconciled year — the default UI selection. */
  defaultYear: number;
  /** True when a provisional (Comtrade) dataset is mounted. */
  hasProvisional: boolean;
}

let catalog: Catalog | null = null;

export function getCatalog(): Catalog {
  if (!catalog) throw new Error("catalog not initialized");
  return catalog;
}

function readManifests(): DatasetVersion[] {
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
}

const glob = (datasetId: string, ...parts: string[]) =>
  path.join(PARQUET_DIR, datasetId, ...parts);

/**
 * Discover dataset manifests and create unified views: reconciled BACI years
 * plus (when present) provisional Comtrade years, each row carrying a
 * `provisional` flag. Cubes that only exist for reconciled data (metrics,
 * dependencies, HS4) are exposed as BACI-only views.
 */
export async function initCatalog(): Promise<Catalog> {
  const datasets = readManifests();
  const baci = datasets.find((d) => d.provider === "baci");
  if (!baci) throw new Error("BACI dataset missing — run `pnpm ingest baci:all`");
  const provisional = datasets.find(
    (d) => d.provider === "comtrade" && d.provisional,
  );

  await exec(`
    CREATE OR REPLACE VIEW dim_countries AS
    SELECT * FROM read_parquet('${glob(baci.id, "dims", "countries.parquet")}')
  `);
  await exec(`
    CREATE OR REPLACE VIEW dim_products AS
    SELECT * FROM read_parquet('${glob(baci.id, "dims", "products.parquet")}')
  `);
  await exec(`
    CREATE OR REPLACE VIEW dim_chapters AS
    SELECT DISTINCT hs2, coalesce(section, 'other') AS section,
           coalesce(section_name, 'Unspecified') AS section_name
    FROM dim_products
  `);

  const baciCube = (name: string) =>
    `read_parquet('${glob(baci.id, "cubes", name, "*", "*.parquet")}', hive_partitioning = true)`;
  const provCube = (name: string) =>
    provisional
      ? `read_parquet('${glob(provisional.id, "cubes", name, "*", "*.parquet")}', hive_partitioning = true)`
      : null;

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
  };
  return catalog;
}
