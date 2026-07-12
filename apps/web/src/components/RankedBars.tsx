import { fmtShare, fmtUsd, fmtUsdExact } from "../lib/format.ts";

export interface BarRow {
  key: string;
  label: string;
  valueUsd: number;
  share: number;
}

interface Props {
  title: string;
  subtitle?: string | undefined;
  rows: BarRow[];
  color: "export" | "import";
  maxRows?: number;
  showRank?: boolean;
  /** When set, rows become clickable (e.g. partner → bilateral view). */
  onRowClick?: ((key: string) => void) | undefined;
}

/** Editorial ranked list: label, proportional bar, value, share. */
export function RankedBars({
  title,
  subtitle,
  rows,
  color,
  maxRows = 10,
  showRank = false,
  onRowClick,
}: Props) {
  const shown = rows.slice(0, maxRows);
  const maxShare = shown[0]?.share ?? 1;
  const barClass = color === "export" ? "bg-export" : "bg-import";
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </h3>
      {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No data reported.</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {shown.map((r, i) => {
            const inner = (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate" title={r.label}>
                    {showRank && (
                      <span className="mr-2 inline-block w-4 text-right text-xs text-ink-muted tnum">
                        {i + 1}
                      </span>
                    )}
                    <span className={onRowClick ? "group-hover:underline" : ""}>
                      {r.label}
                    </span>
                  </span>
                  <span className="shrink-0 tnum">
                    <span title={fmtUsdExact(r.valueUsd)}>
                      {fmtUsd(r.valueUsd)}
                    </span>
                    <span className="ml-2 inline-block w-10 text-right text-xs text-ink-muted">
                      {fmtShare(r.share)}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-line/60">
                  <div
                    className={`h-full rounded-full ${barClass} opacity-80`}
                    style={{ width: `${(r.share / maxShare) * 100}%` }}
                  />
                </div>
              </>
            );
            return (
              <li key={r.key} className="text-sm">
                {onRowClick ? (
                  <button
                    type="button"
                    onClick={() => onRowClick(r.key)}
                    className="group block w-full text-left"
                  >
                    {inner}
                  </button>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
