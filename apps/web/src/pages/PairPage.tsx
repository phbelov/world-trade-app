import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { PairDirection, PairSummary } from "@world-trade/shared/api";
import { ArrowLeftRight } from "lucide-react";
import { TrendChart } from "../components/TrendChart.tsx";
import { SectionHeader, SelectBox } from "../components/ui.tsx";
import { ApiError, fetchMeta, fetchPair, fetchPairTrend } from "../lib/api.ts";
import { fmtShare, fmtUsd, fmtUsdExact } from "../lib/format.ts";
import { usePageTitle } from "../lib/title.ts";
import { pairRoute } from "../router.tsx";

function DirectionColumn({
  from,
  to,
  direction,
  year,
}: {
  from: string;
  to: string;
  direction: PairDirection;
  year: number;
}) {
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(15);
  const filtered = filter.trim()
    ? direction.products.filter(
        (p) =>
          p.name.toLowerCase().includes(filter.trim().toLowerCase()) ||
          p.code.startsWith(filter.trim()),
      )
    : direction.products;
  const shown = filtered.slice(0, limit);
  return (
    <section className="min-w-0">
      <h3 className="label">{from} sells {to}</h3>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-2xl font-semibold tnum text-export">
          {direction.totalUsd != null ? fmtUsd(direction.totalUsd) : "—"}
        </span>
        {direction.shareOfExportsTotal != null && (
          <span className="text-xs text-ink-muted">
            {fmtShare(direction.shareOfExportsTotal)} of {from}&rsquo;s exports
          </span>
        )}
      </div>
      {direction.products.length > 0 ? (
        <>
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLimit(15);
            }}
            placeholder={`Filter ${direction.productCount.toLocaleString()} products…`}
            aria-label={`Filter products ${from} sells ${to}`}
            className="mt-3 w-full border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-line-strong"
          />
          <ul className="mt-2 divide-y divide-line border-t border-b border-line">
            {shown.map((p) => (
              <li key={p.code}>
                <Link
                  to="/product/$code"
                  params={{ code: p.code }}
                  search={{ year }}
                  className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm hover:bg-line/40"
                >
                  <span className="min-w-0 truncate" title={p.name}>
                    <span className="mr-2 text-xs text-ink-muted tnum">
                      {p.code}
                    </span>
                    {p.name}
                  </span>
                  <span className="shrink-0 tnum" title={fmtUsdExact(p.valueUsd)}>
                    {fmtUsd(p.valueUsd)}
                    <span className="ml-2 inline-block w-10 text-right text-xs text-ink-muted">
                      {fmtShare(p.share)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-3 py-4 text-sm text-ink-muted">
                No products match.
              </li>
            )}
          </ul>
          {filtered.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 25)}
              className="mt-2 w-full border border-line bg-bg py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted hover:border-line-strong hover:text-ink"
            >
              Show more ({filtered.length - limit} remaining
              {direction.productCount > direction.products.length
                ? ` of top ${direction.products.length} by value`
                : ""}
              )
            </button>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">
          No flows reported in this direction.
        </p>
      )}
    </section>
  );
}

export function PairPage() {
  const { a, b } = pairRoute.useParams();
  const { year } = pairRoute.useSearch();
  const navigate = useNavigate();

  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
  const effectiveYear = year ?? meta.data?.defaultYear;
  const summary = useQuery({
    queryKey: ["pair", a, b, effectiveYear],
    queryFn: () => fetchPair(a, b, effectiveYear),
    enabled: effectiveYear != null,
  });
  const trend = useQuery({
    queryKey: ["pairTrend", a, b],
    queryFn: () => fetchPairTrend(a, b),
  });
  usePageTitle(
    summary.data ? `${summary.data.a.name} ⇄ ${summary.data.b.name}` : undefined,
  );

  if (meta.isPending || summary.isPending) {
    return (
      <div className="mt-8 space-y-6" aria-busy="true">
        <div className="skeleton h-12 w-96" />
        <div className="skeleton h-64 w-full" />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="skeleton h-96" />
          <div className="skeleton h-96" />
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
          {notFound ? "Unknown country pair" : "Something went wrong"}
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          {notFound
            ? `“${a} / ${b}” doesn't resolve to two distinct countries.`
            : "The data service could not be reached."}
        </p>
      </div>
    );
  }

  const s: PairSummary = summary.data;
  const balance =
    s.aToB.totalUsd != null && s.bToA.totalUsd != null
      ? s.aToB.totalUsd - s.bToA.totalUsd
      : null;

  return (
    <div className="mt-8 space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            <Link
              to="/country/$iso3"
              params={{ iso3: s.a.iso3 }}
              className="hover:underline"
            >
              {s.a.name}
            </Link>
            <button
              type="button"
              aria-label="Swap countries"
              title="Swap countries"
              onClick={() =>
                navigate({
                  to: "/pair/$a/$b",
                  params: { a: b, b: a },
                  search: (prev) => prev,
                })
              }
              className="mx-3 inline-flex align-middle text-ink-muted hover:text-ink"
            >
              <ArrowLeftRight size={20} />
            </button>
            <Link
              to="/country/$iso3"
              params={{ iso3: s.b.iso3 }}
              className="hover:underline"
            >
              {s.b.name}
            </Link>
          </h1>
          <p className="label mt-2">
            Bilateral goods trade · {s.year}
            {s.provisional && " · provisional (chapter-level detail)"}
          </p>
        </div>
        {meta.data && (
          <SelectBox
            label="Select year"
            value={s.year}
            onChange={(v) => {
              const y = Number(v);
              navigate({
                to: "/pair/$a/$b",
                params: { a, b },
                search: y === meta.data!.defaultYear ? {} : { year: y },
              });
            }}
          >
            {[...meta.data.years].reverse().map((y) => (
              <option key={y.year} value={y.year}>
                {y.year}
                {y.provisional ? " (provisional)" : ""}
              </option>
            ))}
          </SelectBox>
        )}
      </header>

      <div className="flex flex-wrap gap-x-14 gap-y-4 text-sm">
        <div>
          <div className="label">Balance for {s.a.name}</div>
          <div
            className={`mt-1 text-2xl font-semibold tnum ${
              balance == null
                ? ""
                : balance >= 0
                  ? "text-positive"
                  : "text-negative"
            }`}
          >
            {balance != null
              ? `${balance >= 0 ? "+" : "−"}${fmtUsd(Math.abs(balance))}`
              : "—"}
          </div>
        </div>
      </div>

      <section>
        <SectionHeader title="The relationship over time" annotation="Trend" />
        <div className="mt-4">
          {trend.isPending ? (
            <div className="skeleton h-64 w-full" />
          ) : trend.isError ? (
            <p className="text-sm text-ink-muted">Trend unavailable.</p>
          ) : (
            <TrendChart
              points={trend.data.points.map((p) => ({
                year: p.year,
                exportsUsd: p.aToBUsd,
                importsUsd: p.bToAUsd,
                provisional: p.provisional,
              }))}
              labels={{
                a: `${s.a.iso3} → ${s.b.iso3}`,
                b: `${s.b.iso3} → ${s.a.iso3}`,
              }}
            />
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <DirectionColumn
          from={s.a.name}
          to={s.b.name}
          direction={s.aToB}
          year={s.year}
        />
        <DirectionColumn
          from={s.b.name}
          to={s.a.name}
          direction={s.bToA}
          year={s.year}
        />
      </div>

      {s.entityNotes.length > 0 && (
        <p className="text-xs italic text-ink-muted">
          {s.entityNotes.map((n) => n.note).join(" · ")}.
        </p>
      )}
    </div>
  );
}
