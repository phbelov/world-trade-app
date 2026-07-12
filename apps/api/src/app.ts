import { Hono } from "hono";
import type {
  CountryOption,
  CountryTrend,
  CountryYearSummary,
  DependencyEntry,
  EntityNote,
  FlowMetrics,
  Meta,
  PartnerEntry,
  SectionEntry,
  TopFlows,
  WorldSnapshot,
} from "@world-trade/shared/api";
import { query } from "./db.ts";
import { getCatalog } from "./datasets.ts";
import { inCodes, num, numOrNull, resolveCountry } from "./lib.ts";
import { registerPairRoutes } from "./routes/pair.ts";
import { registerProductRoutes } from "./routes/product.ts";

async function partnersFor(
  codes: number[],
  year: number,
  direction: "exports" | "imports",
): Promise<PartnerEntry[]> {
  const [us, them] =
    direction === "exports" ? ["exporter", "importer"] : ["importer", "exporter"];
  const rows = await query<{
    iso3: string;
    name: string;
    v: number;
    share: number;
  }>(`
    SELECT c.iso3, c.display_name AS name, sum(b.value_usd) AS v,
           sum(b.value_usd) / sum(sum(b.value_usd)) OVER () AS share
    FROM v_bilateral b
    JOIN dim_countries c ON b.${them} = c.code
    WHERE b.${us} IN ${inCodes(codes)} AND b.year = ${year}
    GROUP BY 1, 2 ORDER BY v DESC LIMIT 12
  `);
  return rows.map((r) => ({
    iso3: r.iso3,
    name: r.name,
    valueUsd: num(r.v),
    share: num(r.share),
  }));
}

export function createApp(): Hono {
  const app = new Hono();

  app.use("/api/*", async (c, next) => {
    await next();
    // Data changes only on re-ingest/redeploy: browsers may cache for an
    // hour, the CDN indefinitely (Vercel purges its cache on deploy).
    c.header(
      "Cache-Control",
      "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400",
    );
  });

  app.get("/api/meta", async (c) => {
    const catalog = getCatalog();
    const countries = await query<CountryOption>(`
      SELECT iso3, display_name AS name FROM dim_countries
      WHERE valid_until IS NULL ORDER BY name
    `);
    const meta: Meta = {
      years: catalog.years,
      defaultYear: catalog.defaultYear,
      countries,
      datasets: catalog.datasets,
    };
    return c.json(meta);
  });

  app.get("/api/world", async (c) => {
    const catalog = getCatalog();
    const year = Number(c.req.query("year") ?? catalog.defaultYear);
    const yearInfo = catalog.years.find((y) => y.year === year);
    if (!yearInfo) return c.json({ error: "year out of range" }, 400);

    const rows = await query<{
      iso3: string;
      name: string;
      x: number | null;
      m: number | null;
      src: string | null;
    }>(`
      SELECT c.iso3, any_value(c.display_name) AS name,
             sum(t.exports_usd) AS x, sum(t.imports_usd) AS m,
             min(t.exports_source) AS src
      FROM v_country_totals t
      JOIN dim_countries c ON t.country = c.code
      WHERE t.year = ${year}
      GROUP BY c.iso3
    `);
    const worldRows = await query<{ year: number; v: number }>(`
      SELECT year, sum(exports_usd) AS v FROM v_country_totals
      WHERE year IN (${year}, ${year - 1}) GROUP BY year
    `);
    const worldNow = worldRows.find((r) => num(r.year) === year);
    const worldPrev = worldRows.find((r) => num(r.year) === year - 1);

    const snapshot: WorldSnapshot = {
      year,
      provisional: yearInfo.provisional,
      world: {
        exportsUsd: num(worldNow?.v ?? 0),
        prevYearExportsUsd: numOrNull(worldPrev?.v),
        growth:
          worldNow && worldPrev
            ? num(worldNow.v) / num(worldPrev.v) - 1
            : null,
      },
      countries: rows.map((r) => {
        const x = numOrNull(r.x);
        const m = numOrNull(r.m);
        return {
          iso3: r.iso3,
          name: r.name,
          exportsUsd: x,
          importsUsd: m,
          totalUsd: (x ?? 0) + (m ?? 0),
          balanceUsd: x != null && m != null ? x - m : null,
          exportsSource: (r.src as "reported" | "mirror" | null) ?? null,
        };
      }),
    };
    return c.json(snapshot);
  });

  app.get("/api/flows/top", async (c) => {
    const catalog = getCatalog();
    const year = Number(c.req.query("year") ?? catalog.defaultYear);
    const yearInfo = catalog.years.find((y) => y.year === year);
    if (!yearInfo) return c.json({ error: "year out of range" }, 400);
    const limit = Math.min(
      Math.max(Number(c.req.query("limit") ?? 30), 1),
      100,
    );
    const iso3 = c.req.query("iso3")?.toUpperCase();
    if (iso3 && !/^[A-Z]{3}$/.test(iso3)) {
      return c.json({ error: "invalid iso3" }, 400);
    }

    const rows = await query<{ f: string; t: string; v: number }>(`
      SELECT ce.iso3 AS f, ci.iso3 AS t, sum(b.value_usd) AS v
      FROM v_bilateral b
      JOIN dim_countries ce ON b.exporter = ce.code
      JOIN dim_countries ci ON b.importer = ci.code
      WHERE b.year = ${year}
      ${iso3 ? `AND (ce.iso3 = '${iso3}' OR ci.iso3 = '${iso3}')` : ""}
      GROUP BY 1, 2
      ORDER BY v DESC
      LIMIT ${limit}
    `);
    const flows: TopFlows = {
      year,
      provisional: yearInfo.provisional,
      flows: rows.map((r) => ({ from: r.f, to: r.t, valueUsd: num(r.v) })),
    };
    return c.json(flows);
  });

  app.get("/api/country/:iso3", async (c) => {
    const iso3 = c.req.param("iso3").toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso3)) return c.json({ error: "invalid iso3" }, 400);
    const catalog = getCatalog();
    const year = Number(c.req.query("year") ?? catalog.defaultYear);
    const yearInfo = catalog.years.find((y) => y.year === year);
    if (!yearInfo) return c.json({ error: "year out of range" }, 400);
    const ref = await resolveCountry(iso3);
    if (!ref) return c.json({ error: "unknown country" }, 404);
    const codes = inCodes(ref.codes);

    const totalsRows = await query<{
      x: number | null;
      m: number | null;
      src: string | null;
    }>(`
      SELECT sum(exports_usd) AS x, sum(imports_usd) AS m,
             min(exports_source) AS src
      FROM v_country_totals
      WHERE country IN ${codes} AND year = ${year}
    `);
    const t = totalsRows[0];
    const exportsUsd = numOrNull(t?.x);
    const importsUsd = numOrNull(t?.m);

    const rankRows = await query<{ rx: bigint; rm: bigint; n: bigint }>(`
      WITH per AS (
        SELECT c.iso3, sum(t.exports_usd) AS x, sum(t.imports_usd) AS m
        FROM v_country_totals t
        JOIN dim_countries c ON t.country = c.code
        WHERE t.year = ${year}
        GROUP BY 1
      )
      SELECT rank() OVER (ORDER BY x DESC NULLS LAST) AS rx,
             rank() OVER (ORDER BY m DESC NULLS LAST) AS rm,
             count(*) OVER () AS n
      FROM per
      QUALIFY iso3 = '${iso3}'
    `);
    const rank = rankRows[0];

    const sectionRows = await query<{
      flow: string;
      section: string;
      section_name: string;
      v: number;
    }>(`
      SELECT f.flow, ch.section, ch.section_name, sum(f.value_usd) AS v
      FROM v_country_flow_hs2 f
      JOIN dim_chapters ch USING (hs2)
      WHERE f.country IN ${codes} AND f.year = ${year}
      GROUP BY 1, 2, 3
      ORDER BY v DESC
    `);
    const sectionsOf = (flow: "X" | "M"): SectionEntry[] => {
      const rows = sectionRows.filter((r) => r.flow === flow);
      const total = rows.reduce((s, r) => s + num(r.v), 0);
      return rows.map((r) => ({
        sectionId: r.section,
        name: r.section_name,
        valueUsd: num(r.v),
        share: total > 0 ? num(r.v) / total : 0,
      }));
    };

    let metrics: CountryYearSummary["metrics"] = null;
    let dependencies: DependencyEntry[] | null = null;
    if (!yearInfo.provisional) {
      const metricRows = await query<{
        flow: string;
        partner_hhi: number;
        top_partner_share: number;
        partner_count: bigint;
        product_hhi: number;
        top_iso3: string;
        top_name: string;
      }>(`
        SELECT m.flow, m.partner_hhi, m.top_partner_share, m.partner_count,
               m.product_hhi, c.iso3 AS top_iso3, c.display_name AS top_name
        FROM v_metrics_country m
        JOIN dim_countries c ON m.top_partner = c.code
        WHERE m.country IN ${codes} AND m.year = ${year}
      `);
      const metricOf = (flow: "X" | "M"): FlowMetrics | null => {
        const r = metricRows.find((m) => m.flow === flow);
        if (!r) return null;
        return {
          partnerHhi: num(r.partner_hhi),
          topPartner: { iso3: r.top_iso3, name: r.top_name, share: num(r.top_partner_share) },
          partnerCount: num(r.partner_count),
          productHhi: num(r.product_hhi),
        };
      };
      const ex = metricOf("X");
      const im = metricOf("M");
      metrics = ex && im ? { exports: ex, imports: im } : null;

      const depRows = await query<{
        hs6: string;
        product_name: string;
        supplier_iso3: string;
        supplier_name: string;
        share: number;
        total_import_usd: number;
      }>(`
        SELECT d.hs6, p.name AS product_name, c.iso3 AS supplier_iso3,
               c.display_name AS supplier_name, d.share, d.total_import_usd
        FROM v_import_dependency d
        JOIN dim_products p USING (hs6)
        JOIN dim_countries c ON d.top_supplier = c.code
        WHERE d.importer IN ${codes} AND d.year = ${year}
        ORDER BY d.total_import_usd DESC LIMIT 8
      `);
      dependencies = depRows.map((r) => ({
        hs6: r.hs6,
        productName: r.product_name,
        supplierIso3: r.supplier_iso3,
        supplierName: r.supplier_name,
        share: num(r.share),
        totalImportUsd: num(r.total_import_usd),
      }));
    }

    const summary: CountryYearSummary = {
      iso3,
      name: ref.name,
      year,
      provisional: yearInfo.provisional,
      exportsSource:
        (t?.src as "reported" | "mirror" | null) ??
        (yearInfo.provisional ? null : "reported"),
      totals: {
        exportsUsd,
        importsUsd,
        balanceUsd:
          exportsUsd != null && importsUsd != null
            ? exportsUsd - importsUsd
            : null,
        exportRank: rank ? num(rank.rx) : null,
        importRank: rank ? num(rank.rm) : null,
        rankedCountries: rank ? num(rank.n) : 0,
      },
      exportPartners: await partnersFor(ref.codes, year, "exports"),
      importPartners: await partnersFor(ref.codes, year, "imports"),
      exportSections: sectionsOf("X"),
      importSections: sectionsOf("M"),
      metrics,
      dependencies,
      entityNotes: ref.entityNotes,
    };
    return c.json(summary);
  });

  app.get("/api/country/:iso3/trend", async (c) => {
    const iso3 = c.req.param("iso3").toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso3)) return c.json({ error: "invalid iso3" }, 400);
    const ref = await resolveCountry(iso3);
    if (!ref) return c.json({ error: "unknown country" }, 404);
    const rows = await query<{
      year: number;
      x: number | null;
      m: number | null;
      prov: boolean;
      src: string | null;
    }>(`
      SELECT year, sum(exports_usd) AS x, sum(imports_usd) AS m,
             bool_or(provisional) AS prov, min(exports_source) AS src
      FROM v_country_totals
      WHERE country IN ${inCodes(ref.codes)}
      GROUP BY 1 ORDER BY 1
    `);
    const trend: CountryTrend = {
      iso3,
      name: ref.name,
      points: rows.map((r) => ({
        year: num(r.year),
        exportsUsd: numOrNull(r.x),
        importsUsd: numOrNull(r.m),
        provisional: Boolean(r.prov),
        ...(r.src === "mirror" ? { estimated: true } : {}),
      })),
      entityNotes: ref.entityNotes,
    };
    return c.json(trend);
  });

  registerPairRoutes(app);
  registerProductRoutes(app);

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}
