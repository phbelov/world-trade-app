import type { EntityNote } from "@world-trade/shared/api";
import { query } from "./db.ts";

/** DuckDB returns BIGINT as BigInt; JSON needs number. */
export const num = (v: unknown): number => Number(v);
export const numOrNull = (v: unknown): number | null =>
  v == null ? null : Number(v);

export interface CountryRef {
  iso3: string;
  /** All fact codes sharing the ISO3 (current + historical, year-disjoint). */
  codes: number[];
  name: string;
  entityNotes: EntityNote[];
}

export async function resolveCountry(iso3: string): Promise<CountryRef | null> {
  const rows = await query<{
    code: number;
    display_name: string;
    valid_until: number | null;
  }>(`
    SELECT code, display_name, valid_until FROM dim_countries
    WHERE iso3 = '${iso3}' ORDER BY valid_until NULLS LAST
  `);
  if (rows.length === 0) return null;
  const current = rows.find((r) => r.valid_until == null) ?? rows[0]!;
  return {
    iso3,
    codes: rows.map((r) => num(r.code)),
    name: current.display_name,
    entityNotes: rows
      .filter((r) => r.valid_until != null && num(r.code) !== num(current.code))
      .map((r) => ({
        throughYear: num(r.valid_until),
        note: `Reported as ${r.display_name} through ${num(r.valid_until)}`,
      })),
  };
}

export const inCodes = (codes: number[]) => `(${codes.join(", ")})`;

export const ISO3_RE = /^[A-Z]{3}$/;
/** HS codes: digits, plus rare legacy alphanumeric HS6 specials (9999AA). */
export const HS_CODE_RE = /^[0-9]{2}([0-9]{2}([0-9A-Z]{2})?)?$/;

/** Escape a user string for embedding in a single-quoted SQL literal. */
export const sqlString = (s: string) => s.replace(/'/g, "''");
