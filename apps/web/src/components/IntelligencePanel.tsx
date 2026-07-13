import { Link } from "@tanstack/react-router";
import type { CountryYearSummary } from "@world-trade/shared/api";
import { fmtShare, fmtUsd } from "../lib/format.ts";

/** Conventional HHI concentration bands (US DOJ thresholds). */
function hhiLevel(hhi: number): string {
  if (hhi < 0.15) return "Diversified";
  if (hhi < 0.25) return "Moderately concentrated";
  return "Highly concentrated";
}

function MetricCard({
  label,
  value,
  detail,
  explainer,
}: {
  label: string;
  value: string;
  detail?: string;
  explainer: string;
}) {
  return (
    <div className="border-t border-line pt-3">
      <div className="label">{label}</div>
      <div className="mt-1.5 text-lg font-medium tnum">{value}</div>
      {detail && <div className="text-sm text-ink-muted tnum">{detail}</div>}
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">{explainer}</p>
    </div>
  );
}

/**
 * The "economic intelligence" layer: partner concentration and single-supplier
 * dependencies. Only available for reconciled years — provisional years get an
 * honest explanation instead of silently missing content.
 */
export function IntelligencePanel({
  summary,
}: {
  summary: CountryYearSummary;
}) {
  if (summary.provisional) {
    return (
      <section className="border border-dashed border-line-strong p-5 text-sm text-ink-muted">
        <h2 className="text-lg font-semibold tracking-tight text-ink">
          Dependencies &amp; concentration
        </h2>
        <p className="mt-2 leading-relaxed">
          Concentration metrics and dependency analysis require reconciled
          product-level data, which is not yet available for {summary.year}.
          Select a year up to the latest reconciled release to see them.
        </p>
      </section>
    );
  }
  const m = summary.metrics;
  return (
    <section>
      <div className="border-t border-line pt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Dependencies &amp; concentration
        </h2>
        <span className="label">Analysis</span>
      </div>
      {m ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Export markets"
            value={hhiLevel(m.exports.partnerHhi)}
            detail={`HHI ${m.exports.partnerHhi.toFixed(3)} · ${m.exports.partnerCount} partners`}
            explainer="Herfindahl–Hirschman index of export destinations: how dependent exports are on few markets (0 = spread out, 1 = a single market)."
          />
          <MetricCard
            label="Top export market"
            value={summary.metrics!.exports.topPartner.name}
            detail={`${fmtShare(m.exports.topPartner.share)} of exports`}
            explainer="The single largest destination and its share of total exports."
          />
          <MetricCard
            label="Import sources"
            value={hhiLevel(m.imports.partnerHhi)}
            detail={`HHI ${m.imports.partnerHhi.toFixed(3)} · ${m.imports.partnerCount} partners`}
            explainer="Concentration of import origins — higher values mean supply depends on fewer countries."
          />
          <MetricCard
            label="Top import source"
            value={m.imports.topPartner.name}
            detail={`${fmtShare(m.imports.topPartner.share)} of imports`}
            explainer="The single largest supplier and its share of total imports."
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">
          No concentration metrics available for this year.
        </p>
      )}

      <div className="mt-6">
        <h3 className="label">Concentrated import dependencies</h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          Products where at least half of imports come from a single supplier
          (minimum $5M). Largest first.
        </p>
        {summary.dependencies && summary.dependencies.length > 0 ? (
          <ul className="mt-3 divide-y divide-line border-t border-b border-line">
            {summary.dependencies.map((d) => (
              <li
                key={d.hs6}
                className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <Link
                    to="/product/$code"
                    params={{ code: d.hs6 }}
                    search={{ year: summary.year }}
                    className="block truncate hover:underline"
                    title={d.productName}
                  >
                    {d.productName}
                  </Link>
                  <span className="text-xs text-ink-muted tnum">
                    HS {d.hs6} · {fmtUsd(d.totalImportUsd)} imported
                  </span>
                </span>
                <Link
                  to="/pair/$a/$b"
                  params={{ a: summary.iso3, b: d.supplierIso3 }}
                  search={{ year: summary.year }}
                  className="shrink-0 border border-line px-2 py-1 text-xs font-medium text-negative tnum hover:border-line-strong"
                >
                  {fmtShare(d.share)} from {d.supplierName}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            No single-supplier dependencies above the threshold — imports are
            well diversified.
          </p>
        )}
      </div>
    </section>
  );
}
