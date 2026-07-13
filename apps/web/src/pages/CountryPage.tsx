import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { CountryYearSummary, Meta } from "@world-trade/shared/api";
import { IntelligencePanel } from "../components/IntelligencePanel.tsx";
import { RankedBars } from "../components/RankedBars.tsx";
import { TrendChart } from "../components/TrendChart.tsx";
import {
  ErrorState,
  Label,
  SectionHeader,
  SelectBox,
  Stat,
} from "../components/ui.tsx";
import { ApiError, fetchMeta, fetchSummary, fetchTrend } from "../lib/api.ts";
import { fmtBalance, fmtRank, fmtUsd, fmtUsdExact } from "../lib/format.ts";
import { usePageTitle } from "../lib/title.ts";
import { countryRoute } from "../router.tsx";

function YearSelect({
  meta,
  year,
  iso3,
}: {
  meta: Meta;
  year: number;
  iso3: string;
}) {
  const navigate = useNavigate();
  return (
    <SelectBox
      label="Select year"
      value={year}
      onChange={(v) => {
        const y = Number(v);
        navigate({
          to: "/country/$iso3",
          params: { iso3 },
          search: y === meta.defaultYear ? {} : { year: y },
        });
      }}
    >
      {[...meta.years].reverse().map((y) => (
        <option key={y.year} value={y.year}>
          {y.year}
          {y.provisional ? " (provisional)" : ""}
        </option>
      ))}
    </SelectBox>
  );
}

function ProvisionalBanner({ summary }: { summary: CountryYearSummary }) {
  return (
    <div className="border border-dashed border-line-strong px-4 py-3 text-sm leading-relaxed text-ink-muted">
      <strong>{summary.year} is provisional.</strong>{" "}
      {summary.exportsSource === "mirror" ? (
        <>
          {summary.name} has not yet reported {summary.year}; its figures are
          estimated from trading partners&rsquo; declarations (a lower bound)
          and have not been reconciled.
        </>
      ) : (
        <>
          Figures are {summary.name}&rsquo;s own declarations to UN Comtrade,
          not yet mirror-reconciled, at chapter-level product detail.
        </>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mt-8 space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="skeleton h-12 w-72" />
        <div className="flex gap-10">
          <div className="skeleton h-16 w-40" />
          <div className="skeleton h-16 w-40" />
          <div className="skeleton h-16 w-40" />
        </div>
      </div>
      <div className="skeleton h-72 w-full" />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="skeleton h-96" />
        <div className="skeleton h-96" />
      </div>
    </div>
  );
}

export function CountryPage() {
  const { iso3 } = countryRoute.useParams();
  const { year } = countryRoute.useSearch();
  const navigate = useNavigate();

  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
  const effectiveYear = year ?? meta.data?.defaultYear;
  const summary = useQuery({
    queryKey: ["summary", iso3, effectiveYear],
    queryFn: () => fetchSummary(iso3, effectiveYear),
    enabled: effectiveYear != null,
  });
  const trend = useQuery({
    queryKey: ["trend", iso3],
    queryFn: () => fetchTrend(iso3),
  });
  usePageTitle(summary.data?.name ?? iso3);

  if (meta.isPending || summary.isPending) return <ProfileSkeleton />;

  if (summary.isError) {
    const err = summary.error;
    const notFound = err instanceof ApiError && err.status === 404;
    return (
      <ErrorState
        title={notFound ? "Unknown country" : "Something went wrong"}
        message={
          notFound
            ? `“${iso3}” doesn't match any country in the dataset. Use search to find one.`
            : "The data service could not be reached. Your connection or the server may be down."
        }
        onRetry={notFound ? undefined : () => summary.refetch()}
      />
    );
  }

  const s = summary.data;
  const t = s.totals;
  const hasData = t.exportsUsd != null || t.importsUsd != null;

  return (
    <div className="mt-8 space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {s.name}
          </h1>
          <p className="label mt-2">
            Goods trade · {s.year}
            {s.provisional && " · provisional"}
          </p>
        </div>
        {meta.data && (
          <YearSelect meta={meta.data} year={s.year} iso3={iso3} />
        )}
      </header>

      {s.provisional && <ProvisionalBanner summary={s} />}

      {!hasData ? (
        <div className="border border-line px-5 py-8 text-center">
          <p className="font-medium">
            No trade reported for {s.name} in {s.year}.
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            This means the flows are absent from the source data — not that
            trade was zero.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-14 gap-y-6">
            <Stat
              label="Exports"
              value={t.exportsUsd != null ? fmtUsd(t.exportsUsd) : "—"}
              valueTitle={
                t.exportsUsd != null ? fmtUsdExact(t.exportsUsd) : "Not reported"
              }
              note={
                t.exportRank != null
                  ? `${fmtRank(t.exportRank)} of ${t.rankedCountries} exporters`
                  : undefined
              }
              tone="export"
            />
            <Stat
              label="Imports"
              value={t.importsUsd != null ? fmtUsd(t.importsUsd) : "—"}
              valueTitle={
                t.importsUsd != null ? fmtUsdExact(t.importsUsd) : "Not reported"
              }
              note={
                t.importRank != null
                  ? `${fmtRank(t.importRank)} of ${t.rankedCountries} importers`
                  : undefined
              }
              tone="import"
            />
            <Stat
              label="Balance"
              value={t.balanceUsd != null ? fmtBalance(t.balanceUsd) : "—"}
              valueTitle={
                t.balanceUsd != null
                  ? fmtUsdExact(t.balanceUsd)
                  : "Needs both flows"
              }
              note={
                t.balanceUsd != null
                  ? t.balanceUsd >= 0
                    ? "trade surplus"
                    : "trade deficit"
                  : undefined
              }
              tone={
                t.balanceUsd == null
                  ? undefined
                  : t.balanceUsd >= 0
                    ? "positive"
                    : "negative"
              }
            />
          </div>

          <section>
            <SectionHeader title="Three decades of trade" annotation="Trend" />
            <div className="mt-4">
              {trend.isPending ? (
                <div className="skeleton h-72 w-full" />
              ) : trend.isError ? (
                <p className="text-sm text-ink-muted">
                  Trend unavailable right now.
                </p>
              ) : (
                <TrendChart points={trend.data.points} />
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <RankedBars
              title="Top export destinations"
              subtitle="Click a partner to open the bilateral view"
              rows={s.exportPartners.map((p) => ({
                key: p.iso3,
                label: p.name,
                valueUsd: p.valueUsd,
                share: p.share,
              }))}
              color="export"
              showRank
              onRowClick={(partner) =>
                navigate({
                  to: "/pair/$a/$b",
                  params: { a: iso3, b: partner },
                  search: { year: s.year },
                })
              }
            />
            <RankedBars
              title="Top import sources"
              subtitle="Click a partner to open the bilateral view"
              rows={s.importPartners.map((p) => ({
                key: p.iso3,
                label: p.name,
                valueUsd: p.valueUsd,
                share: p.share,
              }))}
              color="import"
              showRank
              onRowClick={(partner) =>
                navigate({
                  to: "/pair/$a/$b",
                  params: { a: iso3, b: partner },
                  search: { year: s.year },
                })
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <RankedBars
              title="What it exports"
              subtitle="By HS section"
              rows={s.exportSections.map((x) => ({
                key: x.sectionId,
                label: x.name,
                valueUsd: x.valueUsd,
                share: x.share,
              }))}
              color="export"
              maxRows={8}
            />
            <RankedBars
              title="What it imports"
              subtitle="By HS section"
              rows={s.importSections.map((x) => ({
                key: x.sectionId,
                label: x.name,
                valueUsd: x.valueUsd,
                share: x.share,
              }))}
              color="import"
              maxRows={8}
            />
          </div>

          <IntelligencePanel summary={s} />
        </>
      )}

      {s.entityNotes.length > 0 && (
        <p className="text-xs italic text-ink-muted">
          {s.entityNotes.map((n) => n.note).join(" · ")}. Historical series are
          continuous across the entity change.
        </p>
      )}
    </div>
  );
}
