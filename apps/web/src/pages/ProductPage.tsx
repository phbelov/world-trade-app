import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { RankedBars } from "../components/RankedBars.tsx";
import { TrendChart } from "../components/TrendChart.tsx";
import {
  ApiError,
  fetchMeta,
  fetchProduct,
  fetchProductTrend,
} from "../lib/api.ts";
import { fmtShare, fmtUsd, fmtUsdExact } from "../lib/format.ts";
import { productRoute } from "../router.tsx";

export function ProductPage() {
  const { code } = productRoute.useParams();
  const { year } = productRoute.useSearch();
  const navigate = useNavigate();

  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
  // Product detail exists only for reconciled years.
  const reconciledYears =
    meta.data?.years.filter((y) => !y.provisional) ?? [];
  const lastReconciled = meta.data?.defaultYear;
  const effectiveYear =
    year != null && reconciledYears.some((y) => y.year === year)
      ? year
      : lastReconciled;

  const summary = useQuery({
    queryKey: ["product", code, effectiveYear],
    queryFn: () => fetchProduct(code, effectiveYear),
    enabled: effectiveYear != null,
  });
  const trend = useQuery({
    queryKey: ["productTrend", code],
    queryFn: () => fetchProductTrend(code),
  });

  if (meta.isPending || summary.isPending) {
    return (
      <div className="mt-8 space-y-6" aria-busy="true">
        <div className="skeleton h-12 w-[500px] max-w-full" />
        <div className="skeleton h-64 w-full" />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="skeleton h-80" />
          <div className="skeleton h-80" />
        </div>
      </div>
    );
  }
  if (summary.isError) {
    const notFound =
      summary.error instanceof ApiError && summary.error.status < 500;
    return (
      <div className="mx-auto mt-24 max-w-md text-center">
        <h1 className="font-display text-3xl font-semibold">
          {notFound ? "Unknown product code" : "Something went wrong"}
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          {notFound
            ? `“${code}” doesn't match an HS chapter, heading, or product.`
            : "The data service could not be reached."}
        </p>
      </div>
    );
  }

  const s = summary.data;
  const levelLabel =
    s.info.level === "hs2"
      ? "HS chapter"
      : s.info.level === "hs4"
        ? "HS heading"
        : "HS product";

  return (
    <div className="mt-8 space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <nav className="text-xs text-ink-muted" aria-label="Product hierarchy">
            {s.info.sectionName && <span>{s.info.sectionName}</span>}
            {s.info.level !== "hs2" && (
              <>
                <span className="mx-1.5">›</span>
                <Link
                  to="/product/$code"
                  params={{ code: s.info.chapterCode }}
                  search={{ year: s.year }}
                  className="hover:underline"
                >
                  {s.info.chapterCode} {s.info.chapterName}
                </Link>
              </>
            )}
          </nav>
          <h1 className="mt-1 font-display text-3xl font-semibold leading-tight tracking-tight">
            {s.info.name}
          </h1>
          <p className="mt-1 text-sm text-ink-muted tnum">
            {levelLabel} {s.info.code} · {s.year}
          </p>
        </div>
        <select
          aria-label="Select year"
          value={s.year}
          onChange={(e) => {
            const y = Number(e.target.value);
            navigate({
              to: "/product/$code",
              params: { code },
              search: y === lastReconciled ? {} : { year: y },
            });
          }}
          className="h-9 rounded border border-line bg-surface px-2 text-sm hover:border-line-strong"
        >
          {[...reconciledYears].reverse().map((y) => (
            <option key={y.year} value={y.year}>
              {y.year}
            </option>
          ))}
        </select>
      </header>

      <div className="flex flex-wrap gap-x-14 gap-y-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            World trade
          </div>
          <div
            className="mt-1 text-2xl font-semibold tnum"
            title={fmtUsdExact(s.worldTradeUsd)}
          >
            {fmtUsd(s.worldTradeUsd)}
          </div>
        </div>
        {s.unitValueUsdPerTonne != null && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Unit value
            </div>
            <div className="mt-1 text-2xl font-semibold tnum">
              ${Math.round(s.unitValueUsdPerTonne).toLocaleString()}/t
            </div>
            <div className="mt-0.5 text-xs text-ink-muted">
              tonnage reported for {fmtShare(s.quantityValueCoverage ?? 0)} of
              trade value
            </div>
          </div>
        )}
      </div>

      {meta.data && meta.data.years.some((y) => y.provisional) && (
        <p className="text-xs text-ink-muted">
          Product-level detail requires reconciled data — provisional years are
          not shown here.
        </p>
      )}

      <section>
        <h2 className="font-display text-xl font-semibold">
          World trade since {trend.data?.points[0]?.year ?? 1995}
        </h2>
        <div className="mt-4">
          {trend.isPending ? (
            <div className="skeleton h-64 w-full" />
          ) : trend.isError ? (
            <p className="text-sm text-ink-muted">Trend unavailable.</p>
          ) : (
            <TrendChart
              points={trend.data.points.map((p) => ({
                year: p.year,
                exportsUsd: p.valueUsd,
                importsUsd: null,
                provisional: false,
              }))}
              labels={{ a: "World trade", b: "" }}
            />
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <RankedBars
          title="Top exporters"
          subtitle="Share of world trade in this product"
          rows={s.topExporters.map((p) => ({
            key: p.iso3,
            label: p.name,
            valueUsd: p.valueUsd,
            share: p.share,
          }))}
          color="export"
          showRank
          onRowClick={(iso3) =>
            navigate({ to: "/country/$iso3", params: { iso3 } })
          }
        />
        <RankedBars
          title="Top importers"
          subtitle="Share of world trade in this product"
          rows={s.topImporters.map((p) => ({
            key: p.iso3,
            label: p.name,
            valueUsd: p.valueUsd,
            share: p.share,
          }))}
          color="import"
          showRank
          onRowClick={(iso3) =>
            navigate({ to: "/country/$iso3", params: { iso3 } })
          }
        />
      </div>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Largest trade routes
        </h3>
        <ul className="mt-3 divide-y divide-line rounded border border-line bg-surface">
          {s.topRoutes.map((r) => (
            <li key={`${r.fromIso3}-${r.toIso3}`}>
              <Link
                to="/pair/$a/$b"
                params={{ a: r.fromIso3, b: r.toIso3 }}
                search={{ year: s.year }}
                className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm hover:bg-line/40"
              >
                <span>
                  {r.fromName}{" "}
                  <span className="text-ink-muted">→</span> {r.toName}
                </span>
                <span className="tnum" title={fmtUsdExact(r.valueUsd)}>
                  {fmtUsd(r.valueUsd)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
