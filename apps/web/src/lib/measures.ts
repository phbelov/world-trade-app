import type { WorldCountryEntry } from "@world-trade/shared/api";

export type Measure = "exports" | "imports" | "total" | "balance";

export const MEASURES: { id: Measure; label: string }[] = [
  { id: "exports", label: "Exports" },
  { id: "imports", label: "Imports" },
  { id: "total", label: "Total trade" },
  { id: "balance", label: "Trade balance" },
];

export function isMeasure(v: unknown): v is Measure {
  return MEASURES.some((m) => m.id === v);
}

/** null means "no data" — rendered as the no-data fill, never as zero. */
export function measureValue(
  e: WorldCountryEntry,
  measure: Measure,
): number | null {
  switch (measure) {
    case "exports":
      return e.exportsUsd;
    case "imports":
      return e.importsUsd;
    case "total":
      return e.exportsUsd == null && e.importsUsd == null ? null : e.totalUsd;
    case "balance":
      return e.balanceUsd;
  }
}
