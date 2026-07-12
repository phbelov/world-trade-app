/**
 * Correctness gate for the provisional Comtrade dataset (HS2 grain, 2025).
 * Skips entirely when the dataset hasn't been fetched — contributors without
 * an API key still get a green suite.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { BACI_DATASET_ID, datasetDir } from "../src/config.ts";

const PERIOD = 2025;
const ROOT = datasetDir(`comtrade-hs2-${PERIOD}`);
const FACTS = `read_parquet('${path.join(ROOT, "facts_hs2", "*", "*.parquet")}', hive_partitioning = false)`;
const BACI = datasetDir(BACI_DATASET_ID);
const exists = fs.existsSync(path.join(ROOT, "manifest.json"));

let instance: DuckDBInstance;
let conn: DuckDBConnection;

async function q<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const reader = await conn.runAndReadAll(sql);
  return reader.getRowObjects() as never;
}

async function codeOf(iso3: string): Promise<number> {
  const rows = await q<{ code: number }>(
    `SELECT code FROM read_parquet('${BACI}/dims/countries.parquet')
     WHERE iso3 = '${iso3}' AND valid_until IS NULL`,
  );
  return Number(rows[0]!.code);
}

describe.skipIf(!exists)("comtrade provisional dataset", () => {
  beforeAll(async () => {
    instance = await DuckDBInstance.create(":memory:");
    conn = await instance.connect();
  });

  afterAll(() => {
    conn?.closeSync();
    instance?.closeSync();
  });

  it("manifest is marked provisional and unreconciled", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"),
    );
    expect(manifest.provisional).toBe(true);
    expect(manifest.reconciled).toBe(false);
    expect(manifest.classification).toBe("HS2");
    expect(manifest.reporterCount).toBeGreaterThan(50);
  });

  it("facts are structurally sound", async () => {
    const [r] = await q<Record<string, bigint>>(`
      SELECT
        count(*) FILTER (value_usd IS NULL OR value_usd <= 0)              AS bad_value,
        count(*) FILTER (exporter = importer)                              AS self_trade,
        count(*) FILTER (length(hs2) != 2)                                 AS bad_hs2,
        count(*) FILTER (source NOT IN ('reported', 'mirror'))             AS bad_source,
        count(*) FILTER (exporter NOT IN (
          SELECT code FROM read_parquet('${BACI}/dims/countries.parquet'))) AS orphan_exporter
      FROM ${FACTS}
    `);
    expect(Number(r!.bad_value)).toBe(0);
    expect(Number(r!.self_trade)).toBe(0);
    expect(Number(r!.bad_hs2)).toBe(0);
    expect(Number(r!.bad_source)).toBe(0);
    expect(Number(r!.orphan_exporter)).toBe(0);
  });

  it("each exporter has exactly one source (per-exporter mirror rule)", async () => {
    const mixed = await q(`
      SELECT exporter FROM ${FACTS}
      GROUP BY exporter HAVING count(DISTINCT source) > 1
    `);
    expect(mixed).toHaveLength(0);
  });

  it("Germany 2025 exports (reported) are in the published range", async () => {
    const deu = await codeOf("DEU");
    const [r] = await q<{ v: number; src: string }>(`
      SELECT sum(value_usd) AS v, min(source) AS src
      FROM ${FACTS} WHERE exporter = ${deu}
    `);
    expect(r!.src).toBe("reported");
    expect(Number(r!.v)).toBeGreaterThan(1.4e12);
    expect(Number(r!.v)).toBeLessThan(2.2e12);
  });

  it("China 2025 exports are mirror-estimated at a plausible magnitude", async () => {
    const chn = await codeOf("CHN");
    const [r] = await q<{ v: number; src: string }>(`
      SELECT sum(value_usd) AS v, min(source) AS src
      FROM ${FACTS} WHERE exporter = ${chn}
    `);
    // China had not reported 2025 at fetch time; partners' imports ≈ $3–4T.
    expect(r!.src).toBe("mirror");
    expect(Number(r!.v)).toBeGreaterThan(2.0e12);
    expect(Number(r!.v)).toBeLessThan(5.0e12);
  });

  it("world total is continuous with BACI's latest year", async () => {
    const [c] = await q<{ v: number }>(
      `SELECT sum(value_usd) AS v FROM ${FACTS}`,
    );
    const [b] = await q<{ v: number }>(`
      SELECT sum(value_usd) AS v
      FROM read_parquet('${BACI}/facts/year=2024/*.parquet')
    `);
    const ratio = Number(c!.v) / Number(b!.v);
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.3);
  });

  it("bilateral cube totals equal fact totals", async () => {
    const [r] = await q<{ f: number; c: number }>(`
      SELECT
        (SELECT sum(value_usd) FROM ${FACTS}) AS f,
        (SELECT sum(value_usd) FROM read_parquet(
          '${path.join(ROOT, "cubes", "bilateral", "*", "*.parquet")}',
          hive_partitioning = true)) AS c
    `);
    expect(Math.abs(Number(r!.f) - Number(r!.c)) / Number(r!.c)).toBeLessThan(1e-9);
  });
});
