import type { Hono } from "hono";
import type {
  HsLevel,
  PartnerEntry,
  ProductInfo,
  ProductSearchResult,
  ProductSummary,
  ProductTrend,
} from "@world-trade/shared/api";
import { query } from "../db.ts";
import { getCatalog } from "../datasets.ts";
import { HS_CODE_RE, num, numOrNull, sqlString } from "../lib.ts";

/** Unit values are only shown when at least this share of trade (by value) has tonnage. */
const UNIT_VALUE_MIN_COVERAGE = 0.5;

function levelOf(code: string): HsLevel {
  return code.length === 2 ? "hs2" : code.length === 4 ? "hs4" : "hs6";
}

async function productInfo(code: string): Promise<ProductInfo | null> {
  const level = levelOf(code);
  const hs2 = code.slice(0, 2);
  const [chapter] = await query<{ chapter_name: string }>(
    `SELECT chapter_name FROM dim_chapter_names WHERE hs2 = '${hs2}'`,
  );
  if (!chapter) return null;
  const [section] = await query<{ section: string; section_name: string }>(
    `SELECT DISTINCT section, section_name FROM dim_chapters WHERE hs2 = '${hs2}'`,
  );
  let name: string;
  if (level === "hs6") {
    const [p] = await query<{ name: string }>(
      `SELECT name FROM dim_products WHERE hs6 = '${code}'`,
    );
    if (!p) return null;
    name = p.name;
  } else if (level === "hs4") {
    const [child] = await query<{ n: bigint }>(
      `SELECT count(*) AS n FROM dim_products WHERE hs4 = '${code}'`,
    );
    if (!child || num(child.n) === 0) return null;
    name = `Heading ${code} · ${chapter.chapter_name}`;
  } else {
    name = chapter.chapter_name;
  }
  return {
    code,
    level,
    name,
    sectionId: section?.section ?? null,
    sectionName: section?.section_name ?? null,
    chapterCode: hs2,
    chapterName: chapter.chapter_name,
  };
}

/** SQL predicate matching this code at fact grain. */
const hs6Match = (code: string) =>
  code.length === 6 ? `hs6 = '${code}'` : `starts_with(hs6, '${code}')`;

async function topCountries(
  code: string,
  year: number,
  flow: "X" | "M",
  worldTotal: number,
): Promise<PartnerEntry[]> {
  const level = levelOf(code);
  let rows: { iso3: string; name: string; v: number }[];
  if (level === "hs6") {
    const side = flow === "X" ? "exporter" : "importer";
    rows = await query(`
      SELECT c.iso3, c.display_name AS name, sum(f.value_usd) AS v
      FROM read_parquet('${getCatalog().factsGlobForYear(year)}') f
      JOIN dim_countries c ON f.${side} = c.code
      WHERE f.hs6 = '${code}'
      GROUP BY 1, 2 ORDER BY v DESC LIMIT 15
    `);
  } else {
    const view = level === "hs4" ? "v_country_flow_hs4" : "v_country_flow_hs2";
    const col = level === "hs4" ? "hs4" : "hs2";
    rows = await query(`
      SELECT c.iso3, c.display_name AS name, sum(f.value_usd) AS v
      FROM ${view} f
      JOIN dim_countries c ON f.country = c.code
      WHERE f.${col} = '${code}' AND f.flow = '${flow}' AND f.year = ${year}
        ${level === "hs2" ? "AND NOT f.provisional" : ""}
      GROUP BY 1, 2 ORDER BY v DESC LIMIT 15
    `);
  }
  return rows.map((r) => ({
    iso3: r.iso3,
    name: r.name,
    valueUsd: num(r.v),
    share: worldTotal > 0 ? num(r.v) / worldTotal : 0,
  }));
}

export function registerProductRoutes(app: Hono): void {
  app.get("/api/products/search", async (c) => {
    const raw = (c.req.query("q") ?? "").trim();
    if (raw.length < 2) return c.json([] satisfies ProductSearchResult[]);
    const q = sqlString(raw.replace(/[%_]/g, ""));
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 12), 1), 30);
    const rows = await query<ProductSearchResult & { rank: number }>(`
      SELECT code, name, level FROM (
        SELECT hs2 AS code, chapter_name AS name, 'hs2' AS level,
          CASE
            WHEN hs2 = '${q}' THEN 0
            WHEN chapter_name ILIKE '${q}%' THEN 1
            WHEN chapter_name ILIKE '%${q}%' THEN 3
          END AS rank
        FROM dim_chapter_names
        UNION ALL
        SELECT hs6, name, 'hs6',
          CASE
            WHEN hs6 = '${q}' THEN 0
            WHEN hs6 LIKE '${q}%' THEN 2
            WHEN name ILIKE '${q}%' THEN 2
            WHEN name ILIKE '%${q}%' THEN 4
          END
        FROM dim_products
      )
      WHERE rank IS NOT NULL
      ORDER BY rank, level, code
      LIMIT ${limit}
    `);
    return c.json(
      rows.map(({ code, name, level }) => ({ code, name, level })),
    );
  });

  app.get("/api/product/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    if (!HS_CODE_RE.test(code)) return c.json({ error: "invalid HS code" }, 400);
    const catalog = getCatalog();
    const year = Number(c.req.query("year") ?? catalog.defaultYear);
    const yearInfo = catalog.years.find((y) => y.year === year);
    if (!yearInfo) return c.json({ error: "year out of range" }, 400);
    if (yearInfo.provisional) {
      return c.json(
        { error: "product detail requires reconciled data; pick an earlier year" },
        400,
      );
    }
    const info = await productInfo(code);
    if (!info) return c.json({ error: "unknown HS code" }, 404);

    const [world] = await query<{
      v: number | null;
      q: number | null;
      cov: number | null;
    }>(`
      SELECT sum(value_usd) AS v, sum(quantity_tonnes) AS q,
             sum(value_usd * coalesce(quantity_value_coverage, 0)) / sum(value_usd) AS cov
      FROM v_product_world
      WHERE year = ${year} AND ${hs6Match(code)}
    `);
    const worldTradeUsd = numOrNull(world?.v) ?? 0;
    const coverage = info.level === "hs6" ? numOrNull(world?.cov) : null;
    const tonnes = numOrNull(world?.q);
    const unitValue =
      info.level === "hs6" &&
      coverage != null &&
      coverage >= UNIT_VALUE_MIN_COVERAGE &&
      tonnes
        ? (worldTradeUsd * coverage) / tonnes
        : null;

    const [topExporters, topImporters] = [
      await topCountries(code, year, "X", worldTradeUsd),
      await topCountries(code, year, "M", worldTradeUsd),
    ];

    const routeRows = await query<{
      fi: string;
      fn: string;
      ti: string;
      tn: string;
      v: number;
    }>(
      info.level === "hs2"
        ? `
      SELECT ce.iso3 AS fi, ce.display_name AS fn,
             ci.iso3 AS ti, ci.display_name AS tn, sum(b.value_usd) AS v
      FROM v_bilateral_hs2 b
      JOIN dim_countries ce ON b.exporter = ce.code
      JOIN dim_countries ci ON b.importer = ci.code
      WHERE b.hs2 = '${code}' AND b.year = ${year} AND NOT b.provisional
      GROUP BY 1, 2, 3, 4 ORDER BY v DESC LIMIT 12`
        : `
      SELECT ce.iso3 AS fi, ce.display_name AS fn,
             ci.iso3 AS ti, ci.display_name AS tn, sum(f.value_usd) AS v
      FROM read_parquet('${catalog.factsGlobForYear(year)}') f
      JOIN dim_countries ce ON f.exporter = ce.code
      JOIN dim_countries ci ON f.importer = ci.code
      WHERE ${hs6Match(code)}
      GROUP BY 1, 2, 3, 4 ORDER BY v DESC LIMIT 12`,
    );

    const summary: ProductSummary = {
      info,
      year,
      worldTradeUsd,
      quantityValueCoverage: coverage,
      unitValueUsdPerTonne: unitValue,
      topExporters,
      topImporters,
      topRoutes: routeRows.map((r) => ({
        fromIso3: r.fi,
        fromName: r.fn,
        toIso3: r.ti,
        toName: r.tn,
        valueUsd: num(r.v),
      })),
    };
    return c.json(summary);
  });

  app.get("/api/product/:code/trend", async (c) => {
    const code = c.req.param("code").toUpperCase();
    if (!HS_CODE_RE.test(code)) return c.json({ error: "invalid HS code" }, 400);
    const level = levelOf(code);
    const rows = await query<{
      year: number;
      v: number;
      q: number | null;
      cov: number | null;
    }>(`
      SELECT year, sum(value_usd) AS v, sum(quantity_tonnes) AS q,
             sum(value_usd * coalesce(quantity_value_coverage, 0)) / sum(value_usd) AS cov
      FROM v_product_world
      WHERE ${hs6Match(code)}
      GROUP BY year ORDER BY year
    `);
    if (rows.length === 0) return c.json({ error: "unknown HS code" }, 404);
    const trend: ProductTrend = {
      code,
      points: rows.map((r) => {
        const v = num(r.v);
        const q = numOrNull(r.q);
        const cov = numOrNull(r.cov);
        return {
          year: num(r.year),
          valueUsd: v,
          quantityTonnes: level === "hs6" ? q : null,
          unitValueUsdPerTonne:
            level === "hs6" && q && cov != null && cov >= UNIT_VALUE_MIN_COVERAGE
              ? (v * cov) / q
              : null,
        };
      }),
    };
    return c.json(trend);
  });
}
