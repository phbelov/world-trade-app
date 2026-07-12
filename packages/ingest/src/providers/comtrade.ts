/**
 * UN Comtrade+ adapter — provisional recent years at HS2 chapter grain.
 *
 * Why HS2: chapter boundaries are stable across HS revisions, so reporters'
 * native classifications need no concordance to be comparable. Product-level
 * (HS6) detail for provisional years would require HS→HS92 concordance on
 * unreconciled data and ~2 days of API quota; deliberately out of scope.
 *
 * Mirror completion, decided per exporter: countries that reported use their
 * own export declarations (FOB); countries that did not (e.g. late reporters)
 * are estimated from their partners' import declarations (CIF), flagged
 * source='mirror'. The dataset is marked provisional + unreconciled and the
 * UI must render it visually distinct from BACI years.
 */
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { DatasetVersion } from "@world-trade/shared";
import {
  BACI_DATASET_ID,
  COMTRADE_API_KEY,
  RAW_DIR,
  datasetDir,
} from "../config.ts";
import { withDuck } from "../duck.ts";

const API_BASE = "https://comtradeapi.un.org/data/v1";
/** Free tier truncates at 100k records — a truncated response must never be ingested. */
const RECORD_CAP = 100_000;
/** Comtrade also enforces an undocumented per-minute rate limit; stay slow. */
const CALL_DELAY_MS = 1500;
const MAX_RATE_LIMIT_RETRIES = 5;

export class QuotaError extends Error {}

interface AvailabilityRecord {
  reporterCode: number;
  reporterISO: string;
  reporterDesc: string;
  totalRecords: number;
  datasetChecksum: number;
  lastReleased: string;
}

interface Checkpoint {
  reporters: Record<
    string,
    { checksum: number; rows: number; fetchedAt: string }
  >;
}

function rawDir(period: number): string {
  return path.join(RAW_DIR, "comtrade", String(period));
}

const checkpointPath = (period: number) =>
  path.join(rawDir(period), "checkpoint.state.json");

function loadCheckpoint(period: number): Checkpoint {
  try {
    return JSON.parse(fs.readFileSync(checkpointPath(period), "utf8"));
  } catch {
    return { reporters: {} };
  }
}

async function apiGet(
  pathname: string,
  params: Record<string, string>,
  attempt = 0,
): Promise<{ data?: unknown[]; error?: unknown; count?: number }> {
  if (!COMTRADE_API_KEY) {
    throw new Error("COMTRADE_API_KEY missing — add it to the repo-root .env");
  }
  const url = new URL(`${API_BASE}${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": COMTRADE_API_KEY },
  });
  if (res.status === 429) {
    // Per-minute rate limit, not the daily quota — back off and retry.
    if (attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw new QuotaError(
        `Comtrade still rate-limiting (429) after ${attempt} backoffs — ` +
          `progress is checkpointed; rerun later to resume.`,
      );
    }
    const retryAfterS = Number(res.headers.get("retry-after")) || 0;
    const waitMs = Math.max(retryAfterS * 1000, 15_000 * 2 ** attempt);
    console.log(`rate-limited (429) — backing off ${Math.round(waitMs / 1000)}s`);
    await sleep(waitMs);
    return apiGet(pathname, params, attempt + 1);
  }
  if (res.status === 403) {
    throw new QuotaError(
      `Comtrade returned 403 — daily quota likely exhausted. ` +
        `Progress is checkpointed; rerun to resume (quota resets daily).`,
    );
  }
  if (!res.ok) {
    throw new Error(`Comtrade ${pathname} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as never;
}

export async function fetchAvailability(
  period: number,
): Promise<AvailabilityRecord[]> {
  const res = await apiGet("/getDa/C/A/HS", { period: String(period) });
  return (res.data ?? []) as AvailabilityRecord[];
}

/**
 * Fetch classic-view chapter-level bilateral flows for every reporter with
 * data for `period`. Idempotent: reporters whose upstream datasetChecksum is
 * unchanged since the last run are skipped.
 */
export async function fetchComtrade(period: number): Promise<void> {
  const dir = rawDir(period);
  await fs.promises.mkdir(dir, { recursive: true });
  const checkpoint = loadCheckpoint(period);

  const reporters = await fetchAvailability(period);
  console.log(`${reporters.length} reporters have ${period} annual HS data`);

  let fetched = 0;
  let skipped = 0;
  for (const r of reporters) {
    const prev = checkpoint.reporters[String(r.reporterCode)];
    if (prev && prev.checksum === r.datasetChecksum) {
      skipped++;
      continue;
    }
    const res = await apiGet("/get/C/A/HS", {
      reporterCode: String(r.reporterCode),
      period: String(period),
      cmdCode: "AG2",
      flowCode: "X,M",
      includeDesc: "false",
      breakdownMode: "classic",
    });
    if (res.error) {
      throw new Error(
        `Comtrade error for reporter ${r.reporterCode} (${r.reporterISO}): ${JSON.stringify(res.error)}`,
      );
    }
    const rows = res.data ?? [];
    if (rows.length >= RECORD_CAP) {
      throw new Error(
        `Reporter ${r.reporterCode} (${r.reporterISO}) hit the ${RECORD_CAP} record cap — ` +
          `response is truncated; split the query by flow before ingesting.`,
      );
    }
    await fs.promises.writeFile(
      path.join(dir, `r${r.reporterCode}.json`),
      JSON.stringify({ data: rows }),
    );
    checkpoint.reporters[String(r.reporterCode)] = {
      checksum: r.datasetChecksum,
      rows: rows.length,
      fetchedAt: new Date().toISOString(),
    };
    // Checkpoint after every reporter so quota exhaustion loses nothing.
    await fs.promises.writeFile(
      checkpointPath(period),
      JSON.stringify(checkpoint, null, 2),
    );
    fetched++;
    console.log(
      `fetched ${r.reporterISO} (${r.reporterCode}): ${rows.length} rows [${fetched + skipped}/${reporters.length}]`,
    );
    await sleep(CALL_DELAY_MS);
  }
  console.log(`fetch complete: ${fetched} fetched, ${skipped} unchanged`);
}

/**
 * Transform raw reporter files into a provisional canonical dataset:
 * facts at (year, exporter, importer, hs2) grain plus the cube subset whose
 * shapes match the BACI cubes, so the API can serve both uniformly.
 */
export async function transformComtrade(period: number): Promise<void> {
  const datasetId = `comtrade-hs2-${period}`;
  const root = datasetDir(datasetId);
  const dir = rawDir(period);
  const reporterGlob = path.join(dir, "r*.json");
  const countriesParquet = path.join(
    datasetDir(BACI_DATASET_ID),
    "dims",
    "countries.parquet",
  );
  if (!fs.existsSync(countriesParquet)) {
    throw new Error("BACI dims missing — run baci:dims first (shared country dimension)");
  }

  const factsDir = path.join(root, "facts_hs2", `year=${period}`);
  await fs.promises.mkdir(factsDir, { recursive: true });

  await withDuck(async (db) => {
    await db.exec(`
      CREATE OR REPLACE VIEW raw_recs AS
      SELECT unnest(data, recursive := true)
      FROM read_json('${reporterGlob}', union_by_name = true, maximum_object_size = 104857600)
    `);
    // Valid entities for this period (historical predecessors excluded).
    await db.exec(`
      CREATE OR REPLACE VIEW dim_c AS
      SELECT code FROM read_parquet('${countriesParquet}')
      WHERE valid_until IS NULL OR valid_until >= ${period}
    `);
    await db.exec(`
      CREATE OR REPLACE TABLE reported AS
      SELECT
        CAST(reporterCode AS INTEGER) AS reporter,
        flowCode                      AS flow,
        CAST(partnerCode AS INTEGER)  AS partner,
        CAST(cmdCode AS VARCHAR)      AS hs2,
        CAST(primaryValue AS DOUBLE)  AS value_usd
      FROM raw_recs
      WHERE flowCode IN ('X', 'M')
        AND partnerCode != 0
        AND length(CAST(cmdCode AS VARCHAR)) = 2
        AND primaryValue > 0
    `);

    // Report how much value is attached to non-country partners (areas nes,
    // bunkers, free zones…) that the country dimension cannot resolve.
    const [drop] = await db.query<{ share: number }>(`
      SELECT coalesce(
        sum(value_usd) FILTER (partner NOT IN (SELECT code FROM dim_c))
          / sum(value_usd), 0) AS share
      FROM reported
    `);
    console.log(
      `unresolvable partner share (areas nes etc.): ${(Number(drop!.share) * 100).toFixed(2)}% of reported value — dropped`,
    );

    // One coherent flow matrix, source decided per exporter.
    await db.exec(`
      CREATE OR REPLACE TABLE facts AS
      WITH x AS (
        SELECT reporter AS exporter, partner AS importer, hs2, value_usd
        FROM reported
        WHERE flow = 'X'
          AND partner IN (SELECT code FROM dim_c)
          AND reporter IN (SELECT code FROM dim_c)
      ),
      m AS (
        SELECT partner AS exporter, reporter AS importer, hs2, value_usd
        FROM reported
        WHERE flow = 'M'
          AND partner IN (SELECT code FROM dim_c)
          AND reporter IN (SELECT code FROM dim_c)
      ),
      x_reporters AS (SELECT DISTINCT exporter FROM x)
      SELECT CAST(${period} AS SMALLINT) AS year, exporter, importer, hs2,
             value_usd, 'reported' AS source
      FROM x
      WHERE exporter != importer
      UNION ALL
      SELECT CAST(${period} AS SMALLINT), exporter, importer, hs2,
             value_usd, 'mirror'
      FROM m
      WHERE exporter NOT IN (SELECT exporter FROM x_reporters)
        AND exporter != importer
    `);
    await db.exec(`
      COPY (SELECT * FROM facts)
      TO '${path.join(factsDir, "data.parquet")}' (FORMAT parquet, COMPRESSION zstd)
    `);

    const cubes: Record<string, string> = {
      bilateral: `
        SELECT exporter, importer, sum(value_usd) AS value_usd,
               count(*) AS product_count, min(source) AS source
        FROM facts GROUP BY 1, 2
      `,
      country_totals: `
        WITH x AS (
          SELECT exporter AS country, sum(value_usd) AS v,
                 count(DISTINCT importer) AS p, min(source) AS source
          FROM facts GROUP BY 1
        ),
        m AS (
          SELECT importer AS country, sum(value_usd) AS v,
                 count(DISTINCT exporter) AS p
          FROM facts GROUP BY 1
        )
        SELECT coalesce(x.country, m.country) AS country,
               x.v AS exports_usd, m.v AS imports_usd,
               x.p AS export_partners, m.p AS import_partners,
               x.source AS exports_source
        FROM x FULL OUTER JOIN m ON x.country = m.country
      `,
      country_flow_hs2: `
        SELECT country, flow, hs2, sum(value_usd) AS value_usd
        FROM (
          SELECT exporter AS country, 'X' AS flow, hs2, value_usd FROM facts
          UNION ALL
          SELECT importer, 'M', hs2, value_usd FROM facts
        ) GROUP BY 1, 2, 3
      `,
      bilateral_hs2: `
        SELECT exporter, importer, hs2, sum(value_usd) AS value_usd
        FROM facts GROUP BY 1, 2, 3
      `,
    };
    for (const [name, sql] of Object.entries(cubes)) {
      const outDir = path.join(root, "cubes", name, `year=${period}`);
      await fs.promises.mkdir(outDir, { recursive: true });
      await db.exec(`
        COPY (${sql}) TO '${path.join(outDir, "data.parquet")}'
        (FORMAT parquet, COMPRESSION zstd)
      `);
    }

    const [stats] = await db.query<{
      rows: bigint;
      exporters: bigint;
      mirror_exporters: bigint;
      total: number;
    }>(`
      SELECT count(*) AS rows,
             count(DISTINCT exporter) AS exporters,
             count(DISTINCT exporter) FILTER (source = 'mirror') AS mirror_exporters,
             sum(value_usd) AS total
      FROM facts
    `);
    console.log(
      `facts year=${period}: ${Number(stats!.rows).toLocaleString()} rows, ` +
        `${stats!.exporters} exporters (${stats!.mirror_exporters} mirror-estimated), ` +
        `world total $${(Number(stats!.total) / 1e12).toFixed(2)}T`,
    );
  });

  const checkpoint = loadCheckpoint(period);
  const reporterCount = Object.keys(checkpoint.reporters).length;
  const manifest: DatasetVersion & {
    ingestedAt: string;
    reporterCount: number;
  } = {
    id: datasetId,
    provider: "comtrade",
    classification: "HS2",
    releasedAt: new Date().toISOString().slice(0, 10),
    firstYear: period,
    lastYear: period,
    reconciled: false,
    provisional: true,
    ingestedAt: new Date().toISOString(),
    reporterCount,
  };
  await fs.promises.writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}
