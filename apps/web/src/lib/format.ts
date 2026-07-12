import { format } from "d3-format";

const compact = format("$.3~s");
const exact = format("$,.0f");
const pct1 = format(".1%");
const pct0 = format(".0%");

/** "$1.24T" style compact USD; d3's G (giga) → B for billions. */
export function fmtUsd(v: number): string {
  return compact(v).replace("G", "B").replace("k", "K");
}

/** Full-precision USD for tooltips/titles. */
export function fmtUsdExact(v: number): string {
  return exact(v);
}

/** Signed compact USD for balances. */
export function fmtBalance(v: number): string {
  return (v >= 0 ? "+" : "−") + fmtUsd(Math.abs(v));
}

export function fmtShare(v: number): string {
  return v >= 0.1 ? pct0(v) : pct1(v);
}

/** Ordinal rank: 1st, 2nd, 3rd… */
export function fmtRank(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
