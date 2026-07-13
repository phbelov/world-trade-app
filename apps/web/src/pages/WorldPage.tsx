import { Suspense, lazy } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import type { WorldCountryEntry } from "@world-trade/shared/api";
import { YearScrubber } from "../components/YearScrubber.tsx";
import { Segmented } from "../components/ui.tsx";
import { fetchMeta, fetchTopFlows, fetchWorld } from "../lib/api.ts";
import { fmtBalance, fmtShare, fmtUsd, fmtUsdExact } from "../lib/format.ts";
import { MEASURES, measureValue, type Measure } from "../lib/measures.ts";
import { usePageTitle } from "../lib/title.ts";
import { useTheme } from "../theme.tsx";
import { worldRoute } from "../router.tsx";

// MapLibre + deck.gl are the heaviest chunks in the app — only the map
// route should pay for them.
const TradeMap = lazy(() =>
  import("../components/TradeMap.tsx").then((m) => ({ default: m.TradeMap })),
);

function RankedList({
  countries,
  measure,
  onPick,
}: {
  countries: WorldCountryEntry[];
  measure: Measure;
  onPick: (iso3: string) => void;
}) {
  const rows = countries
    .map((c) => ({ c, v: measureValue(c, measure) }))
    .filter((d): d is { c: WorldCountryEntry; v: number } => d.v != null)
    .sort((a, b) => b.v - a.v)
    .slice(0, 12);
  const maxV = Math.max(...rows.map((r) => Math.abs(r.v)), 1);
  const label = MEASURES.find((m) => m.id === measure)!.label;
  return (
    <section>
      <h3 className="label">Leaders · {label}</h3>
      <ol className="mt-3 space-y-2">
        {rows.map(({ c, v }, i) => (
          <li key={c.iso3}>
            <button
              type="button"
              onClick={() => onPick(c.iso3)}
              className="group w-full text-left text-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="mr-2 inline-block w-4 text-right text-xs text-ink-muted tnum">
                    {i + 1}
                  </span>
                  <span className="group-hover:underline">{c.name}</span>
                </span>
                <span className="shrink-0 tnum" title={fmtUsdExact(v)}>
                  {measure === "balance" ? fmtBalance(v) : fmtUsd(v)}
                </span>
              </div>
              <div className="ml-6 mt-1 h-1 bg-line/60">
                <div
                  className={`h-full opacity-80 ${
                    measure === "balance" && v < 0 ? "bg-import" : "bg-export"
                  }`}
                  style={{ width: `${(Math.abs(v) / maxV) * 100}%` }}
                />
              </div>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SelectedPanel({
  entry,
  year,
  flows,
  onClear,
}: {
  entry: WorldCountryEntry;
  year: number;
  flows: { from: string; to: string; valueUsd: number }[];
  onClear: () => void;
}) {
  const outbound = flows.filter((f) => f.from === entry.iso3).slice(0, 5);
  const inbound = flows.filter((f) => f.to === entry.iso3).slice(0, 5);
  return (
    <section className="border border-line p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xl font-bold leading-tight tracking-tight">
          {entry.name}
        </h3>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="px-1 text-ink-muted hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm tnum">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Exports</dt>
          <dd className="text-export">
            {entry.exportsUsd != null ? fmtUsd(entry.exportsUsd) : "—"}
            {entry.exportsSource === "mirror" && (
              <span className="ml-1 text-xs text-provisional">est.</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Imports</dt>
          <dd className="text-import">
            {entry.importsUsd != null ? fmtUsd(entry.importsUsd) : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Balance</dt>
          <dd>{entry.balanceUsd != null ? fmtBalance(entry.balanceUsd) : "—"}</dd>
        </div>
      </dl>
      {(outbound.length > 0 || inbound.length > 0) && (
        <div className="mt-4 space-y-1 text-xs tnum text-ink-muted">
          {outbound.map((f) => (
            <div key={`o${f.to}`} className="flex justify-between">
              <span>→ {f.to}</span>
              <span>{fmtUsd(f.valueUsd)}</span>
            </div>
          ))}
          {inbound.map((f) => (
            <div key={`i${f.from}`} className="flex justify-between">
              <span>← {f.from}</span>
              <span>{fmtUsd(f.valueUsd)}</span>
            </div>
          ))}
        </div>
      )}
      <Link
        to="/country/$iso3"
        params={{ iso3: entry.iso3 }}
        search={year ? { year } : {}}
        className="mt-4 block border border-line px-3 py-2 text-center text-[11px] font-medium uppercase tracking-[0.14em] hover:border-line-strong before:content-['['] after:content-[']']"
      >
        &nbsp;Open full profile&nbsp;
      </Link>
    </section>
  );
}

export function WorldPage() {
  usePageTitle("The world in trade");
  const search = worldRoute.useSearch();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
  const year = search.year ?? meta.data?.defaultYear;
  const measure = search.measure ?? "exports";
  const sel = search.sel ?? null;

  const world = useQuery({
    queryKey: ["world", year],
    queryFn: () => fetchWorld(year),
    enabled: year != null,
    placeholderData: (prev) => prev,
  });
  const flows = useQuery({
    queryKey: ["flows", year, sel],
    queryFn: () => fetchTopFlows(year, sel ?? undefined, sel ? 16 : 30),
    enabled: year != null,
    placeholderData: (prev) => prev,
  });

  const setSearch = (patch: {
    [K in keyof typeof search]?: (typeof search)[K] | undefined;
  }) =>
    navigate({
      to: "/",
      search: (prev) => {
        const next = { ...prev, ...patch };
        // Undefined means "remove from URL", not "serialize undefined".
        for (const k of Object.keys(next) as (keyof typeof next)[]) {
          if (next[k] === undefined) delete next[k];
        }
        // Safe: undefined-valued keys were just removed.
        return next as typeof prev;
      },
      replace: true,
    });

  if (meta.isPending || (world.isPending && !world.data)) {
    return (
      <div className="mt-8 space-y-6" aria-busy="true">
        <div className="skeleton h-12 w-96" />
        <div className="skeleton h-[540px] w-full" />
      </div>
    );
  }
  if (world.isError || !world.data || !meta.data || year == null) {
    return (
      <div className="mx-auto mt-24 max-w-md text-center">
        <h1 className="font-display text-3xl font-semibold">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          The data service could not be reached.
        </p>
        <button
          type="button"
          onClick={() => world.refetch()}
          className="mt-5 rounded border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-line-strong"
        >
          Try again
        </button>
      </div>
    );
  }

  const w = world.data;
  const selectedEntry = sel
    ? (w.countries.find((c) => c.iso3 === sel) ?? null)
    : null;

  return (
    <div className="mt-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            The world in trade
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted tnum">
            World exports in {w.year}:{" "}
            <span className="font-medium text-ink">
              {fmtUsd(w.world.exportsUsd)}
            </span>
            {w.world.growth != null && (
              <span
                className={
                  w.world.growth >= 0 ? "text-positive" : "text-negative"
                }
              >
                {" "}
                {w.world.growth >= 0 ? "▲" : "▼"}{" "}
                {fmtShare(Math.abs(w.world.growth))} vs {w.year - 1}
              </span>
            )}
            {w.provisional && (
              <span className="ml-2 text-provisional">provisional</span>
            )}
          </p>
        </div>
        <Segmented
          options={MEASURES.map((m) => ({ id: m.id, label: m.label }))}
          value={measure}
          onChange={(id) => setSearch({ measure: id })}
        />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="h-[420px] sm:h-[540px]">
            <Suspense
              fallback={<div className="skeleton h-full w-full rounded" />}
            >
              <TradeMap
                countries={w.countries}
                flows={flows.data?.flows ?? []}
                measure={measure}
                provisional={w.provisional}
                selected={sel}
                onSelect={(iso3) => setSearch({ sel: iso3 ?? undefined })}
                theme={theme}
              />
            </Suspense>
          </div>
          <YearScrubber
            years={meta.data.years}
            value={year}
            onChange={(y) => setSearch({ year: y })}
          />
        </div>
        <aside>
          {selectedEntry ? (
            <SelectedPanel
              entry={selectedEntry}
              year={year}
              flows={flows.data?.flows ?? []}
              onClear={() => setSearch({ sel: undefined })}
            />
          ) : (
            <RankedList
              countries={w.countries}
              measure={measure}
              onPick={(iso3) => setSearch({ sel: iso3 })}
            />
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Arcs show the largest bilateral flows
            {sel ? ` for the selected country` : ""} — teal end exports,
            orange end imports. Click a country to inspect it.
          </p>
        </aside>
      </div>
    </div>
  );
}
