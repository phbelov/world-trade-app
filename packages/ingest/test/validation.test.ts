/**
 * Data correctness gate for the BACI ingest (M0).
 *
 * These are integration tests against the real ingested Parquet. The
 * magnitude tests compare against externally published figures — they exist
 * to catch unit errors (e.g. forgetting BACI values are thousands of USD)
 * that structural tests can never see.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { BACI_DATASET_ID, datasetDir } from "../src/config.ts";

const ROOT = datasetDir(BACI_DATASET_ID);
const FACTS = `read_parquet('${path.join(ROOT, "facts", "*", "*.parquet")}', hive_partitioning = false)`;
const DIMS = path.join(ROOT, "dims");
const cube = (name: string) =>
  `read_parquet('${path.join(ROOT, "cubes", name, "*", "*.parquet")}', hive_partitioning = true)`;

let instance: DuckDBInstance;
let conn: DuckDBConnection;

async function q<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const reader = await conn.runAndReadAll(sql);
  return reader.getRowObjects() as never;
}

async function one<T = Record<string, unknown>>(sql: string): Promise<T> {
  const rows = await q<T>(sql);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/** Look up a country's numeric code by ISO3 so tests don't hard-code magic numbers. */
async function codeOf(iso3: string): Promise<number> {
  // ISO3 is shared with historical predecessor entities; current ones have no valid_until.
  const row = await one<{ code: number }>(
    `SELECT code FROM read_parquet('${DIMS}/countries.parquet')
     WHERE iso3 = '${iso3}' AND valid_until IS NULL`,
  );
  return Number(row.code);
}

beforeAll(async () => {
  instance = await DuckDBInstance.create(":memory:");
  conn = await instance.connect();
  await conn.run(`SET memory_limit = '3GB'`);
});

afterAll(() => {
  conn?.closeSync();
  instance?.closeSync();
});

describe("manifest", () => {
  it("exists and covers 1995 through at least 2023", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"),
    );
    expect(manifest.id).toBe(BACI_DATASET_ID);
    expect(manifest.firstYear).toBe(1995);
    expect(manifest.lastYear).toBeGreaterThanOrEqual(2023);
    expect(manifest.reconciled).toBe(true);
  });
});

describe("facts structure", () => {
  it("every year partition has a sane row count", async () => {
    const rows = await q<{ year: number; n: bigint }>(
      `SELECT year, count(*) AS n FROM ${FACTS} GROUP BY year ORDER BY year`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(29);
    for (const r of rows) {
      expect(Number(r.n), `year ${r.year}`).toBeGreaterThan(4_000_000);
      expect(Number(r.n), `year ${r.year}`).toBeLessThan(16_000_000);
    }
  });

  it("has no invalid values, self-trade, or malformed codes", async () => {
    const r = await one<Record<string, bigint>>(`
      SELECT
        count(*) FILTER (value_usd IS NULL OR value_usd <= 0)          AS bad_value,
        count(*) FILTER (quantity_tonnes < 0)                          AS negative_qty,
        count(*) FILTER (exporter = importer)                          AS self_trade,
        count(*) FILTER (length(hs6) != 6)                             AS bad_hs6
      FROM ${FACTS}
    `);
    expect(Number(r.bad_value)).toBe(0);
    expect(Number(r.negative_qty)).toBe(0);
    expect(Number(r.self_trade)).toBe(0);
    expect(Number(r.bad_hs6)).toBe(0);
  });

  it("all fact keys resolve against dimensions", async () => {
    const r = await one<Record<string, bigint>>(`
      WITH c AS (SELECT code FROM read_parquet('${DIMS}/countries.parquet')),
           p AS (SELECT hs6 FROM read_parquet('${DIMS}/products.parquet'))
      SELECT
        count(*) FILTER (f.exporter NOT IN (SELECT code FROM c)) AS orphan_exporters,
        count(*) FILTER (f.importer NOT IN (SELECT code FROM c)) AS orphan_importers,
        count(*) FILTER (f.hs6      NOT IN (SELECT hs6  FROM p)) AS orphan_products
      FROM ${FACTS} f
    `);
    expect(Number(r.orphan_exporters)).toBe(0);
    expect(Number(r.orphan_importers)).toBe(0);
    expect(Number(r.orphan_products)).toBe(0);
  });

  it("codes sharing an ISO3 have year-disjoint fact coverage", async () => {
    // The UI unions series by ISO3 (Sudan = 736 through 2011 + 729 after).
    // Overlapping years would double-count a country's trade.
    const overlaps = await q(`
      WITH c AS (SELECT code, iso3, valid_until FROM read_parquet('${DIMS}/countries.parquet')),
      spans AS (
        SELECT c.iso3, c.valid_until, min(t.year) AS miny, max(t.year) AS maxy
        FROM ${cube("country_totals")} t
        JOIN c ON t.country = c.code
        WHERE c.iso3 IN (SELECT iso3 FROM c GROUP BY iso3 HAVING count(*) > 1)
        GROUP BY 1, 2
      )
      SELECT hist.iso3
      FROM spans hist
      JOIN spans cur ON hist.iso3 = cur.iso3
      WHERE hist.valid_until IS NOT NULL AND cur.valid_until IS NULL
        AND hist.maxy >= cur.miny
    `);
    expect(overlaps).toHaveLength(0);
  });

  it("quantity is null (not zero) when unavailable, with sane coverage", async () => {
    const r = await one<{ null_rate: number; zero_qty: bigint }>(`
      SELECT
        avg(CASE WHEN quantity_tonnes IS NULL THEN 1.0 ELSE 0.0 END) AS null_rate,
        count(*) FILTER (quantity_tonnes = 0)                        AS zero_qty
      FROM ${FACTS}
    `);
    // BACI reports missing tonnage as NA → must land as NULL, never 0.
    expect(Number(r.zero_qty)).toBe(0);
    expect(Number(r.null_rate)).toBeLessThan(0.35);
  });
});

describe("magnitudes vs published figures", () => {
  it("world exports 1995 ≈ $5T and 2023 ≈ $22.5T (catches unit errors)", async () => {
    const rows = await q<{ year: number; total: number }>(
      `SELECT year, sum(value_usd) AS total FROM ${FACTS} WHERE year IN (1995, 2023) GROUP BY year`,
    );
    const byYear = Object.fromEntries(rows.map((r) => [Number(r.year), Number(r.total)]));
    expect(byYear[1995]).toBeGreaterThan(3.5e12);
    expect(byYear[1995]).toBeLessThan(6.5e12);
    expect(byYear[2023]).toBeGreaterThan(1.8e13);
    expect(byYear[2023]).toBeLessThan(2.7e13);
  });

  it("Germany, China, USA 2023 totals are in published ranges", async () => {
    const deu = await codeOf("DEU");
    const chn = await codeOf("CHN");
    const usa = await codeOf("USA");
    const totals = await q<{ country: number; exports_usd: number; imports_usd: number }>(
      `SELECT country, exports_usd, imports_usd FROM ${cube("country_totals")}
       WHERE year = 2023 AND country IN (${deu}, ${chn}, ${usa})`,
    );
    const by = new Map(totals.map((t) => [Number(t.country), t]));
    // Germany goods exports 2023 ≈ $1.7T
    expect(Number(by.get(deu)!.exports_usd)).toBeGreaterThan(1.3e12);
    expect(Number(by.get(deu)!.exports_usd)).toBeLessThan(2.1e12);
    // China goods exports 2023 ≈ $3.4T
    expect(Number(by.get(chn)!.exports_usd)).toBeGreaterThan(2.7e12);
    expect(Number(by.get(chn)!.exports_usd)).toBeLessThan(4.1e12);
    // US goods imports 2023 ≈ $3.1T (BACI is FOB, so slightly below CIF figures)
    expect(Number(by.get(usa)!.imports_usd)).toBeGreaterThan(2.4e12);
    expect(Number(by.get(usa)!.imports_usd)).toBeLessThan(3.8e12);
  });
});

describe("cube consistency", () => {
  it("bilateral cube totals equal country_totals totals per year", async () => {
    const rows = await q<{ year: number; b: number; c: number }>(`
      WITH b AS (SELECT year, sum(value_usd) AS v FROM ${cube("bilateral")} GROUP BY year),
           c AS (SELECT year, sum(exports_usd) AS v FROM ${cube("country_totals")} GROUP BY year)
      SELECT b.year, b.v AS b, c.v AS c FROM b JOIN c ON b.year = c.year
    `);
    expect(rows.length).toBeGreaterThanOrEqual(29);
    for (const r of rows) {
      expect(Math.abs(Number(r.b) - Number(r.c)) / Number(r.c), `year ${r.year}`).toBeLessThan(1e-9);
    }
  });

  it("concentration metrics satisfy HHI ≤ top-partner share ≤ 1", async () => {
    const r = await one<Record<string, bigint>>(`
      SELECT
        count(*) FILTER (partner_hhi <= 0 OR partner_hhi > 1.000001)       AS bad_hhi,
        count(*) FILTER (top_partner_share > 1.000001)                     AS bad_share,
        count(*) FILTER (partner_hhi > top_partner_share + 1e-9)           AS hhi_gt_share
      FROM ${cube("metrics_country")}
    `);
    expect(Number(r.bad_hhi)).toBe(0);
    expect(Number(r.bad_share)).toBe(0);
    expect(Number(r.hhi_gt_share)).toBe(0);
  });

  it("import dependency flags respect thresholds", async () => {
    const r = await one<{ n: bigint; bad: bigint }>(`
      SELECT count(*) AS n,
             count(*) FILTER (share < 0.5 OR share > 1.000001 OR total_import_usd < 5e6) AS bad
      FROM ${cube("import_dependency")}
    `);
    expect(Number(r.n)).toBeGreaterThan(10_000);
    expect(Number(r.bad)).toBe(0);
  });
});
