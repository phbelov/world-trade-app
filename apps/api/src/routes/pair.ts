import type { Hono } from "hono";
import type {
  PairDirection,
  PairSummary,
  PairTrend,
} from "@world-trade/shared/api";
import { query } from "../db.ts";
import { getCatalog } from "../datasets.ts";
import {
  ISO3_RE,
  inCodes,
  num,
  numOrNull,
  resolveCountry,
  type CountryRef,
} from "../lib.ts";

const PRODUCT_LIMIT = 500;

/** Top products for one direction: HS6 from facts (reconciled) or HS2 cube (provisional). */
async function directionProducts(
  exporter: CountryRef,
  importer: CountryRef,
  year: number,
  provisional: boolean,
): Promise<{ products: PairDirection["products"]; productCount: number }> {
  if (provisional) {
    const rows = await query<{ code: string; name: string; v: number; n: bigint }>(`
      SELECT b.hs2 AS code, cn.chapter_name AS name,
             sum(b.value_usd) AS v, count(*) OVER () AS n
      FROM v_bilateral_hs2 b
      JOIN dim_chapter_names cn ON b.hs2 = cn.hs2
      WHERE b.year = ${year}
        AND b.exporter IN ${inCodes(exporter.codes)}
        AND b.importer IN ${inCodes(importer.codes)}
      GROUP BY 1, 2 ORDER BY v DESC
    `);
    const total = rows.reduce((s, r) => s + num(r.v), 0);
    return {
      products: rows.map((r) => ({
        code: r.code,
        name: r.name,
        level: "hs2" as const,
        valueUsd: num(r.v),
        share: total > 0 ? num(r.v) / total : 0,
      })),
      productCount: rows.length === 0 ? 0 : num(rows[0]!.n),
    };
  }
  const rows = await query<{ code: string; name: string; v: number; n: bigint }>(`
    SELECT f.hs6 AS code, p.name, sum(f.value_usd) AS v, count(*) OVER () AS n
    FROM ${getCatalog().factsExprForYear(year)} f
    JOIN dim_products p USING (hs6)
    WHERE f.exporter IN ${inCodes(exporter.codes)}
      AND f.importer IN ${inCodes(importer.codes)}
    GROUP BY 1, 2 ORDER BY v DESC
    LIMIT ${PRODUCT_LIMIT}
  `);
  const [tot] = await query<{ t: number | null }>(`
    SELECT sum(value_usd) AS t FROM v_bilateral
    WHERE year = ${year}
      AND exporter IN ${inCodes(exporter.codes)}
      AND importer IN ${inCodes(importer.codes)}
  `);
  const total = numOrNull(tot?.t) ?? 0;
  return {
    products: rows.map((r) => ({
      code: r.code,
      name: r.name,
      level: "hs6" as const,
      valueUsd: num(r.v),
      share: total > 0 ? num(r.v) / total : 0,
    })),
    productCount: rows.length === 0 ? 0 : num(rows[0]!.n),
  };
}

export function registerPairRoutes(app: Hono): void {
  app.get("/api/pair/:a/:b", async (c) => {
    const aIso = c.req.param("a").toUpperCase();
    const bIso = c.req.param("b").toUpperCase();
    if (!ISO3_RE.test(aIso) || !ISO3_RE.test(bIso) || aIso === bIso) {
      return c.json({ error: "invalid country pair" }, 400);
    }
    const catalog = getCatalog();
    const year = Number(c.req.query("year") ?? catalog.defaultYear);
    const yearInfo = catalog.years.find((y) => y.year === year);
    if (!yearInfo) return c.json({ error: "year out of range" }, 400);
    const [a, b] = await Promise.all([
      resolveCountry(aIso),
      resolveCountry(bIso),
    ]);
    if (!a || !b) return c.json({ error: "unknown country" }, 404);

    const [totals] = await query<{ ab: number | null; ba: number | null }>(`
      SELECT
        sum(value_usd) FILTER (
          exporter IN ${inCodes(a.codes)} AND importer IN ${inCodes(b.codes)}
        ) AS ab,
        sum(value_usd) FILTER (
          exporter IN ${inCodes(b.codes)} AND importer IN ${inCodes(a.codes)}
        ) AS ba
      FROM v_bilateral WHERE year = ${year}
    `);
    const [exportTotals] = await query<{ ax: number | null; bx: number | null }>(`
      SELECT
        sum(exports_usd) FILTER (country IN ${inCodes(a.codes)}) AS ax,
        sum(exports_usd) FILTER (country IN ${inCodes(b.codes)}) AS bx
      FROM v_country_totals WHERE year = ${year}
    `);

    const abUsd = numOrNull(totals?.ab);
    const baUsd = numOrNull(totals?.ba);
    const ax = numOrNull(exportTotals?.ax);
    const bx = numOrNull(exportTotals?.bx);

    const [aProducts, bProducts] = [
      await directionProducts(a, b, year, yearInfo.provisional),
      await directionProducts(b, a, year, yearInfo.provisional),
    ];

    const summary: PairSummary = {
      a: { iso3: aIso, name: a.name },
      b: { iso3: bIso, name: b.name },
      year,
      provisional: yearInfo.provisional,
      aToB: {
        totalUsd: abUsd,
        shareOfExportsTotal: abUsd != null && ax ? abUsd / ax : null,
        ...aProducts,
      },
      bToA: {
        totalUsd: baUsd,
        shareOfExportsTotal: baUsd != null && bx ? baUsd / bx : null,
        ...bProducts,
      },
      entityNotes: [...a.entityNotes, ...b.entityNotes],
    };
    return c.json(summary);
  });

  app.get("/api/pair/:a/:b/trend", async (c) => {
    const aIso = c.req.param("a").toUpperCase();
    const bIso = c.req.param("b").toUpperCase();
    if (!ISO3_RE.test(aIso) || !ISO3_RE.test(bIso) || aIso === bIso) {
      return c.json({ error: "invalid country pair" }, 400);
    }
    const [a, b] = await Promise.all([
      resolveCountry(aIso),
      resolveCountry(bIso),
    ]);
    if (!a || !b) return c.json({ error: "unknown country" }, 404);
    const rows = await query<{
      year: number;
      ab: number | null;
      ba: number | null;
      prov: boolean;
    }>(`
      SELECT year,
        sum(value_usd) FILTER (
          exporter IN ${inCodes(a.codes)} AND importer IN ${inCodes(b.codes)}
        ) AS ab,
        sum(value_usd) FILTER (
          exporter IN ${inCodes(b.codes)} AND importer IN ${inCodes(a.codes)}
        ) AS ba,
        bool_or(provisional) AS prov
      FROM v_bilateral
      WHERE (exporter IN ${inCodes(a.codes)} AND importer IN ${inCodes(b.codes)})
         OR (exporter IN ${inCodes(b.codes)} AND importer IN ${inCodes(a.codes)})
      GROUP BY year ORDER BY year
    `);
    const trend: PairTrend = {
      a: { iso3: aIso, name: a.name },
      b: { iso3: bIso, name: b.name },
      points: rows.map((r) => ({
        year: num(r.year),
        aToBUsd: numOrNull(r.ab),
        bToAUsd: numOrNull(r.ba),
        provisional: Boolean(r.prov),
      })),
      entityNotes: [...a.entityNotes, ...b.entityNotes],
    };
    return c.json(trend);
  });
}
