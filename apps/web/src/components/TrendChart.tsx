import { useMemo, useState } from "react";
import { extent, max } from "d3-array";
import { format } from "d3-format";
import { scaleLinear } from "d3-scale";
import { line as d3line } from "d3-shape";
import type { TrendPoint } from "@world-trade/shared/api";
import { fmtUsd } from "../lib/format.ts";

const W = 880;
const H = 300;
const M = { top: 14, right: 76, bottom: 26, left: 26 };
const axisFmt = format("$.2~s");

interface Props {
  points: TrendPoint[];
  /** Legend labels for the two series; defaults to Exports/Imports. */
  labels?: { a: string; b: string };
}

/**
 * Dual-line trend chart (teal series A / orange series B). Reconciled years
 * are solid; the provisional segment is dashed. The legend doubles as a
 * hover readout.
 */
export function TrendChart({ points, labels }: Props) {
  const labelA = labels?.a ?? "Exports";
  const labelB = labels?.b ?? "Imports";
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const { x, y, ticksY, lastReconciledIdx } = useMemo(() => {
    const [minYear, maxYear] = extent(points, (p) => p.year) as [number, number];
    const peak =
      max(points, (p) => Math.max(p.exportsUsd ?? 0, p.importsUsd ?? 0)) ?? 1;
    const x = scaleLinear([minYear, maxYear], [M.left, W - M.right]);
    const y = scaleLinear([0, peak], [H - M.bottom, M.top]).nice();
    let lastReconciledIdx = -1;
    for (let i = 0; i < points.length; i++) {
      if (!points[i]!.provisional) lastReconciledIdx = i;
    }
    return { x, y, ticksY: y.ticks(4), lastReconciledIdx };
  }, [points]);

  const mkLine = (key: "exportsUsd" | "importsUsd") =>
    d3line<TrendPoint>()
      .defined((p) => p[key] != null)
      .x((p) => x(p.year))
      .y((p) => y(p[key]!));

  const reconciled = points.slice(0, lastReconciledIdx + 1);
  // Include the last reconciled point so the dashed segment connects.
  const provisional =
    lastReconciledIdx >= 0 && lastReconciledIdx < points.length - 1
      ? points.slice(lastReconciledIdx)
      : [];

  const shown =
    points.find((p) => p.year === hoverYear) ?? points[points.length - 1]!;
  const last = points[points.length - 1]!;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setHoverYear(Math.round(x.invert(px)));
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm tnum">
        <span className="font-medium text-ink">{shown.year}</span>
        <span>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-export" />
          {labelA}{" "}
          <span className="font-medium">
            {shown.exportsUsd != null ? fmtUsd(shown.exportsUsd) : "—"}
          </span>
        </span>
        {labelB && (
          <span>
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-import" />
            {labelB}{" "}
            <span className="font-medium">
              {shown.importsUsd != null ? fmtUsd(shown.importsUsd) : "—"}
            </span>
          </span>
        )}
        {shown.provisional && (
          <span className="text-xs font-medium text-provisional">
            provisional
            {shown.estimated &&
              " · estimated from partners' reports (lower bound)"}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${labelA} and ${labelB} from ${points[0]!.year} to ${last.year}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverYear(null)}
      >
        {ticksY.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-line"
              strokeWidth={1}
            />
            <text
              x={W - M.right + 6}
              y={y(t) + 3.5}
              className="fill-ink-muted text-[11px] tnum"
            >
              {t === 0 ? "0" : axisFmt(t).replace("G", "B")}
            </text>
          </g>
        ))}
        {x.ticks(6).map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - 8}
            textAnchor="middle"
            className="fill-ink-muted text-[11px] tnum"
          >
            {t}
          </text>
        ))}

        <path
          d={mkLine("exportsUsd")(reconciled) ?? undefined}
          fill="none"
          className="stroke-export"
          strokeWidth={2}
        />
        <path
          d={mkLine("importsUsd")(reconciled) ?? undefined}
          fill="none"
          className="stroke-import"
          strokeWidth={2}
        />
        {provisional.length > 0 && (
          <>
            <path
              d={mkLine("exportsUsd")(provisional) ?? undefined}
              fill="none"
              className="stroke-export"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
            <path
              d={mkLine("importsUsd")(provisional) ?? undefined}
              fill="none"
              className="stroke-import"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          </>
        )}

        {hoverYear != null && x(hoverYear) >= M.left && (
          <line
            x1={x(hoverYear)}
            x2={x(hoverYear)}
            y1={M.top}
            y2={H - M.bottom}
            className="stroke-line-strong"
            strokeWidth={1}
          />
        )}
        {shown.exportsUsd != null && (
          <circle
            cx={x(shown.year)}
            cy={y(shown.exportsUsd)}
            r={3.5}
            className={
              // Hollow marker: mirror-estimated exports are a lower bound.
              shown.estimated ? "fill-bg stroke-export" : "fill-export"
            }
            strokeWidth={shown.estimated ? 2 : 0}
          />
        )}
        {shown.importsUsd != null && (
          <circle
            cx={x(shown.year)}
            cy={y(shown.importsUsd)}
            r={3.5}
            className="fill-import"
          />
        )}
      </svg>
    </div>
  );
}
