import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { line as d3line } from "d3-shape";
import type { TrendPoint } from "@world-trade/shared/api";
import { X } from "lucide-react";
import { Segmented, SelectBox } from "../components/ui.tsx";
import { fetchMeta, fetchSummary, fetchTrend } from "../lib/api.ts";
import { fmtBalance, fmtShare, fmtUsd } from "../lib/format.ts";
import { MEASURES, type Measure } from "../lib/measures.ts";
import { usePageTitle } from "../lib/title.ts";
import { compareRoute } from "../router.tsx";

const MAX_COUNTRIES = 6;

function measureOf(p: TrendPoint, m: Measure): number | null {
  const x = p.exportsUsd;
  const im = p.importsUsd;
  switch (m) {
    case "exports":
      return x;
    case "imports":
      return im;
    case "total":
      return x == null && im == null ? null : (x ?? 0) + (im ?? 0);
    case "balance":
      return x != null && im != null ? x - im : null;
  }
}

const MW = 280;
const MH = 110;
const MM = { top: 8, right: 8, bottom: 8, left: 8 };

/** Small-multiple sparkline: shape comparison, not value reading. */
function MiniTrend({
  points,
  measure,
  domain,
}: {
  points: TrendPoint[];
  measure: Measure;
  domain: [number, number] | null;
}) {
  const values = points.map((p) => measureOf(p, measure));
  const own = extent(values.filter((v): v is number => v != null));
  const [lo, hi] = domain ?? [
    Math.min(own[0] ?? 0, 0),
    Math.max(own[1] ?? 1, 1),
  ];
  const [minYear, maxYear] = extent(points, (p) => p.year) as [number, number];
  const x = scaleLinear([minYear, maxYear], [MM.left, MW - MM.right]);
  const y = scaleLinear([lo, hi], [MH - MM.bottom, MM.top]);
  const mk = d3line<TrendPoint>()
    .defined((p) => measureOf(p, measure) != null)
    .x((p) => x(p.year))
    .y((p) => y(measureOf(p, measure)!));
  let lastReconciled = -1;
  for (let i = 0; i < points.length; i++) {
    if (!points[i]!.provisional) lastReconciled = i;
  }
  const solid = points.slice(0, lastReconciled + 1);
  const dashed =
    lastReconciled >= 0 && lastReconciled < points.length - 1
      ? points.slice(lastReconciled)
      : [];
  const last = points[points.length - 1];
  const lastV = last ? measureOf(last, measure) : null;
  const showZero = lo < 0;
  return (
    <svg viewBox={`0 0 ${MW} ${MH}`} className="w-full" aria-hidden>
      {showZero && (
        <line
          x1={MM.left}
          x2={MW - MM.right}
          y1={y(0)}
          y2={y(0)}
          className="stroke-line-strong"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      )}
      <path
        d={mk(solid) ?? undefined}
        fill="none"
        className={
          measure === "balance" && lastV != null && lastV < 0
            ? "stroke-import"
            : "stroke-export"
        }
        strokeWidth={1.8}
      />
      {dashed.length > 0 && (
        <path
          d={mk(dashed) ?? undefined}
          fill="none"
          className={
            measure === "balance" && lastV != null && lastV < 0
              ? "stroke-import"
              : "stroke-export"
          }
          strokeWidth={1.8}
          strokeDasharray="3 4"
        />
      )}
      {last && lastV != null && (
        <circle
          cx={x(last.year)}
          cy={y(lastV)}
          r={3}
          className={
            last.estimated
              ? "fill-bg stroke-export"
              : measure === "balance" && lastV < 0
                ? "fill-import"
                : "fill-export"
          }
          strokeWidth={last.estimated ? 1.6 : 0}
        />
      )}
    </svg>
  );
}

export function ComparePage() {
  usePageTitle("Compare countries");
  const search = compareRoute.useSearch();
  const navigate = useNavigate();
  const [sharedScale, setSharedScale] = useState(true);

  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
  const isoList = useMemo(
    () =>
      (search.countries ?? "USA,CHN,DEU")
        .split(",")
        .filter((c) => /^[A-Z]{3}$/.test(c))
        .slice(0, MAX_COUNTRIES),
    [search.countries],
  );
  const measure = search.measure ?? "exports";
  const year = search.year ?? meta.data?.defaultYear;

  const setSearch = (patch: {
    countries?: string | undefined;
    measure?: Measure | undefined;
    year?: number | undefined;
  }) =>
    navigate({
      to: "/compare",
      search: (prev) => {
        const next = { ...prev, ...patch };
        for (const k of Object.keys(next) as (keyof typeof next)[]) {
          if (next[k] === undefined) delete next[k];
        }
        return next as typeof prev;
      },
      replace: true,
    });

  const trends = useQueries({
    queries: isoList.map((iso3) => ({
      queryKey: ["trend", iso3],
      queryFn: () => fetchTrend(iso3),
    })),
  });
  const summaries = useQueries({
    queries: isoList.map((iso3) => ({
      queryKey: ["summary", iso3, year],
      queryFn: () => fetchSummary(iso3, year),
      enabled: year != null,
    })),
  });

  const sharedDomain = useMemo<[number, number] | null>(() => {
    if (!sharedScale) return null;
    let lo = 0;
    let hi = 1;
    for (const t of trends) {
      for (const p of t.data?.points ?? []) {
        const v = measureOf(p, measure);
        if (v != null) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    }
    return [lo, hi];
  }, [trends, measure, sharedScale]);

  const addable =
    meta.data?.countries.filter((c) => !isoList.includes(c.iso3)) ?? [];

  return (
    <div className="mt-8 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            Compare countries
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Small multiples share one scale so shapes and magnitudes compare
            honestly.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {meta.data && year != null && (
            <SelectBox
              label="Select year"
              value={year}
              onChange={(v) => {
                const y = Number(v);
                setSearch({
                  year: y === meta.data!.defaultYear ? undefined : y,
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
          <Segmented
            options={MEASURES.map((m) => ({ id: m.id, label: m.label }))}
            value={measure}
            onChange={(id) =>
              setSearch({ measure: id === "exports" ? undefined : id })
            }
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {isoList.map((iso3) => {
          const name =
            meta.data?.countries.find((c) => c.iso3 === iso3)?.name ?? iso3;
          return (
            <span
              key={iso3}
              className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-3 pr-1.5 text-sm"
            >
              {name}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() =>
                  setSearch({
                    countries: isoList.filter((c) => c !== iso3).join(","),
                  })
                }
                className="rounded-full px-1 text-ink-muted hover:text-ink"
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
        {isoList.length < MAX_COUNTRIES && (
          <select
            aria-label="Add country"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                setSearch({
                  countries: [...isoList, e.target.value].join(","),
                });
              }
            }}
            className="h-8 rounded-full border border-dashed border-line-strong bg-transparent px-3 text-sm text-ink-muted hover:text-ink"
          >
            <option value="">+ Add country…</option>
            {addable.map((c) => (
              <option key={c.iso3} value={c.iso3}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={sharedScale}
            onChange={(e) => setSharedScale(e.target.checked)}
            className="accent-(--ink)"
          />
          Shared scale
        </label>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {isoList.map((iso3, i) => {
          const t = trends[i];
          const points = t?.data?.points ?? [];
          const last = points[points.length - 1];
          const lastV = last ? measureOf(last, measure) : null;
          const name =
            meta.data?.countries.find((c) => c.iso3 === iso3)?.name ?? iso3;
          return (
            <div
              key={iso3}
              className="border border-line p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  to="/country/$iso3"
                  params={{ iso3 }}
                  className="truncate font-medium hover:underline"
                >
                  {name}
                </Link>
                <span className="shrink-0 text-sm tnum text-ink-muted">
                  {lastV != null
                    ? measure === "balance"
                      ? fmtBalance(lastV)
                      : fmtUsd(lastV)
                    : "—"}
                  {last?.estimated && " est."}
                </span>
              </div>
              {t?.isPending ? (
                <div className="skeleton mt-2 h-[110px] w-full" />
              ) : t?.isError ? (
                <p className="mt-4 text-sm text-ink-muted">
                  Trend unavailable.
                </p>
              ) : (
                <MiniTrend
                  points={points}
                  measure={measure}
                  domain={sharedDomain}
                />
              )}
            </div>
          );
        })}
        {isoList.length === 0 && (
          <p className="text-sm text-ink-muted">
            Add countries above to compare them.
          </p>
        )}
      </div>

      {isoList.length > 0 && (
        <section className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">
              Country comparison for {year}
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                <th className="py-2 pr-4 font-semibold">Country</th>
                <th className="py-2 pr-4 font-semibold">Exports</th>
                <th className="py-2 pr-4 font-semibold">Imports</th>
                <th className="py-2 pr-4 font-semibold">Balance</th>
                <th className="py-2 pr-4 font-semibold">Top export market</th>
                <th className="py-2 font-semibold">Export concentration</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {isoList.map((iso3, i) => {
                const s = summaries[i]?.data;
                const t = s?.totals;
                return (
                  <tr key={iso3} className="border-b border-line">
                    <td className="py-2.5 pr-4">
                      <Link
                        to="/country/$iso3"
                        params={{ iso3 }}
                        className="hover:underline"
                      >
                        {s?.name ?? iso3}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4">
                      {t?.exportsUsd != null ? (
                        <>
                          {fmtUsd(t.exportsUsd)}
                          {s?.exportsSource === "mirror" && (
                            <span className="text-xs text-provisional"> est.</span>
                          )}
                          {t.exportRank != null && (
                            <span className="ml-1 text-xs text-ink-muted">
                              #{t.exportRank}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {t?.importsUsd != null ? (
                        <>
                          {fmtUsd(t.importsUsd)}
                          {t.importRank != null && (
                            <span className="ml-1 text-xs text-ink-muted">
                              #{t.importRank}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {t?.balanceUsd != null ? (
                        <span
                          className={
                            t.balanceUsd >= 0
                              ? "text-positive"
                              : "text-negative"
                          }
                        >
                          {fmtBalance(t.balanceUsd)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {s?.metrics ? (
                        <>
                          {s.metrics.exports.topPartner.name}
                          <span className="ml-1 text-xs text-ink-muted">
                            {fmtShare(s.metrics.exports.topPartner.share)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5">
                      {s?.metrics
                        ? `HHI ${s.metrics.exports.partnerHhi.toFixed(3)}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {year != null &&
            meta.data?.years.find((y) => y.year === year)?.provisional && (
              <p className="mt-2 text-xs text-ink-muted">
                Rankings for provisional years are indicative; concentration
                metrics require reconciled data.
              </p>
            )}
        </section>
      )}
    </div>
  );
}
