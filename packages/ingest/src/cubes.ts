import fs from "node:fs";
import path from "node:path";
import { BACI_DATASET_ID, datasetDir } from "./config.ts";
import { withDuck, type Duck } from "./duck.ts";

/**
 * Precomputed aggregate cubes, hive-partitioned by year like the facts.
 * Built one year at a time so hash tables stay small and nothing spills
 * on a nearly-full disk.
 *
 * Quantity is aggregated ONLY at HS6 grain (product_world): summing tonnes
 * across different products is physically meaningless.
 */
const CUBES: Record<string, string> = {
  // Bilateral totals: who trades with whom, all products combined.
  bilateral: `
    SELECT exporter, importer,
           sum(value_usd) AS value_usd,
           count(*)       AS product_count
    FROM facts_y
    GROUP BY 1, 2
  `,

  // Country totals by direction. NULL exports/imports (country absent on one
  // side) means "no flows observed", never zero — preserved as NULL.
  country_totals: `
    WITH x AS (
      SELECT exporter AS country, sum(value_usd) AS v, count(DISTINCT importer) AS p
      FROM facts_y GROUP BY 1
    ),
    m AS (
      SELECT importer AS country, sum(value_usd) AS v, count(DISTINCT exporter) AS p
      FROM facts_y GROUP BY 1
    )
    SELECT
      coalesce(x.country, m.country) AS country,
      x.v AS exports_usd,
      m.v AS imports_usd,
      x.p AS export_partners,
      m.p AS import_partners
    FROM x FULL OUTER JOIN m ON x.country = m.country
  `,

  // Product composition per country and direction, chapter grain.
  country_flow_hs2: `
    SELECT country, flow, hs2, sum(value_usd) AS value_usd
    FROM (
      SELECT exporter AS country, 'X' AS flow, substr(hs6, 1, 2) AS hs2, value_usd FROM facts_y
      UNION ALL
      SELECT importer, 'M', substr(hs6, 1, 2), value_usd FROM facts_y
    )
    GROUP BY 1, 2, 3
  `,

  // Same at heading grain — powers treemap drill-down without fact scans.
  country_flow_hs4: `
    SELECT country, flow, hs4, sum(value_usd) AS value_usd
    FROM (
      SELECT exporter AS country, 'X' AS flow, substr(hs6, 1, 4) AS hs4, value_usd FROM facts_y
      UNION ALL
      SELECT importer, 'M', substr(hs6, 1, 4), value_usd FROM facts_y
    )
    GROUP BY 1, 2, 3
  `,

  // Bilateral composition at chapter grain.
  bilateral_hs2: `
    SELECT exporter, importer, substr(hs6, 1, 2) AS hs2, sum(value_usd) AS value_usd
    FROM facts_y
    GROUP BY 1, 2, 3
  `,

  // World totals per product; quantity kept here (single-product grain) with
  // a value-weighted coverage ratio so the UI can qualify tonnage reliability.
  product_world: `
    SELECT
      hs6,
      sum(value_usd)                                             AS value_usd,
      sum(quantity_tonnes)                                       AS quantity_tonnes,
      sum(value_usd) FILTER (quantity_tonnes IS NOT NULL)
        / sum(value_usd)                                         AS quantity_value_coverage,
      count(DISTINCT exporter)                                   AS exporter_count,
      count(DISTINCT importer)                                   AS importer_count
    FROM facts_y
    GROUP BY 1
  `,

  // Concentration metrics per country/direction: partner HHI and product HHI.
  metrics_country: `
    WITH partners AS (
      SELECT country, flow, partner, sum(value_usd) AS v FROM (
        SELECT exporter AS country, 'X' AS flow, importer AS partner, value_usd FROM facts_y
        UNION ALL
        SELECT importer, 'M', exporter, value_usd FROM facts_y
      ) GROUP BY 1, 2, 3
    ),
    partner_metrics AS (
      SELECT country, flow,
        sum(v * v) / (sum(v) * sum(v)) AS partner_hhi,
        arg_max(partner, v)            AS top_partner,
        max(v) / sum(v)                AS top_partner_share,
        count(*)                       AS partner_count
      FROM partners GROUP BY 1, 2
    ),
    products AS (
      SELECT country, flow, hs4, sum(value_usd) AS v FROM (
        SELECT exporter AS country, 'X' AS flow, substr(hs6, 1, 4) AS hs4, value_usd FROM facts_y
        UNION ALL
        SELECT importer, 'M', substr(hs6, 1, 4), value_usd FROM facts_y
      ) GROUP BY 1, 2, 3
    ),
    product_metrics AS (
      SELECT country, flow,
        sum(v * v) / (sum(v) * sum(v)) AS product_hhi,
        arg_max(hs4, v)                AS top_hs4,
        max(v) / sum(v)                AS top_hs4_share
      FROM products GROUP BY 1, 2
    )
    SELECT pm.*, pr.product_hhi, pr.top_hs4, pr.top_hs4_share
    FROM partner_metrics pm
    JOIN product_metrics pr USING (country, flow)
  `,

  // Flagged single-supplier dependencies: importer gets >=50% of a product
  // (>= $5M/yr) from one country. Only flagged rows are stored.
  import_dependency: `
    WITH ranked AS (
      SELECT importer, hs6, exporter AS top_supplier, value_usd AS v,
        sum(value_usd)  OVER (PARTITION BY importer, hs6) AS total_v,
        row_number()    OVER (PARTITION BY importer, hs6 ORDER BY value_usd DESC) AS rn
      FROM facts_y
    )
    SELECT importer, hs6, top_supplier,
           v / total_v AS share,
           total_v     AS total_import_usd
    FROM ranked
    WHERE rn = 1 AND total_v >= 5e6 AND v / total_v >= 0.5
  `,
};

export async function buildCubes(datasetId = BACI_DATASET_ID): Promise<void> {
  const root = datasetDir(datasetId);
  const factsRoot = path.join(root, "facts");
  const years = (await fs.promises.readdir(factsRoot))
    .map((d) => /^year=(\d{4})$/.exec(d)?.[1])
    .filter((y): y is string => y !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
  if (years.length === 0) throw new Error(`No fact partitions under ${factsRoot}`);

  await withDuck(async (db: Duck) => {
    for (const year of years) {
      const t0 = Date.now();
      await db.exec(`
        CREATE OR REPLACE VIEW facts_y AS
        SELECT * FROM read_parquet('${path.join(factsRoot, `year=${year}`, "*.parquet")}')
      `);
      for (const [name, sql] of Object.entries(CUBES)) {
        const outDir = path.join(root, "cubes", name, `year=${year}`);
        await fs.promises.mkdir(outDir, { recursive: true });
        await db.exec(`
          COPY (${sql}) TO '${path.join(outDir, "data.parquet")}'
          (FORMAT parquet, COMPRESSION zstd)
        `);
      }
      console.log(`cubes year=${year} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  });
  console.log(`cubes written under ${path.join(root, "cubes")}`);
}
