/**
 * Canonical data model shared by ingest, API, and web.
 *
 * The internal product classification is HS92 ("HS0") at 6 digits — the only
 * HS vintage in which every year since 1995 can be expressed, giving unbroken
 * product time series. Provider adapters are responsible for concording their
 * native classification into HS92 before emitting canonical rows.
 */

export type FlowDirection = "export" | "import";

/** One immutable ingested release. API responses are namespaced by this id. */
export interface DatasetVersion {
  /** e.g. "baci-hs92-202601" or "comtrade-hs2-2025" */
  id: string;
  provider: "baci" | "comtrade";
  /**
   * HS92 = full HS6 grain concorded to the 1992 vintage.
   * HS2 = chapter grain in reporters' native vintage — chapters are stable
   * across HS revisions, so no concordance is needed (used for provisional years).
   */
  classification: "HS92" | "HS2";
  /** ISO date the upstream release was published */
  releasedAt: string;
  firstYear: number;
  lastYear: number;
  /** BACI: mirror-reconciled values. Comtrade: reporter-declared. */
  reconciled: boolean;
  /** Provisional years are rendered visually distinct in the UI. */
  provisional: boolean;
}

/**
 * Canonical trade flow fact.
 * `quantityTonnes === null` means "not available" — never zero.
 * Absence of a row means "no trade reported" — also never zero.
 */
export interface TradeFlow {
  year: number;
  /** Numeric country code (UN M49-based, as used by BACI/Comtrade) */
  exporter: number;
  importer: number;
  /** 6-digit HS92 code, zero-padded string (e.g. "010111") */
  hs6: string;
  /** Current US dollars (not thousands) */
  valueUsd: number;
  /** Metric tonnes; null when unavailable */
  quantityTonnes: number | null;
}

/**
 * A statistical reporting entity. ISO3 is shared between a current country
 * and its historical predecessors (e.g. Sudan 729 and "Sudan (...2011)" 736),
 * whose fact coverage is year-disjoint. UI-level countries key on ISO3 and
 * union the series of all codes sharing it.
 */
export interface Country {
  /** Numeric code used in fact tables */
  code: number;
  iso3: string;
  iso2: string | null;
  /** Upstream name, e.g. "Sudan (...2011)" for historical entities */
  name: string;
  /** Name with the historical annotation stripped */
  displayName: string;
  /** Last year this entity existed; null for current entities */
  validUntil: number | null;
}

export interface Product {
  /** Zero-padded 6-digit HS92 code */
  hs6: string;
  hs4: string;
  hs2: string;
  /** HS section roman numeral, "I".."XXI" */
  section: string;
  name: string;
}

/** Roman-numeral HS section with display metadata. */
export interface HsSection {
  id: string;
  name: string;
  /** Inclusive HS2 chapter range(s) belonging to this section */
  chapters: Array<[number, number]>;
}
