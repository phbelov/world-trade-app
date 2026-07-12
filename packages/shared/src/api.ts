/**
 * API response contracts, shared between apps/api and apps/web.
 * Conventions: camelCase; monetary values in current USD; `null` always means
 * "not available / not reported" — never zero.
 */
import type { DatasetVersion } from "./index.ts";

export interface YearInfo {
  year: number;
  /** From an unreconciled, incomplete-coverage source; render distinctly. */
  provisional: boolean;
}

export interface CountryOption {
  iso3: string;
  name: string;
}

export interface Meta {
  years: YearInfo[];
  /** Latest reconciled year — the default selection. */
  defaultYear: number;
  countries: CountryOption[];
  datasets: DatasetVersion[];
}

export interface PartnerEntry {
  iso3: string;
  name: string;
  valueUsd: number;
  /** Share of the country's total for this flow, 0..1 */
  share: number;
}

export interface SectionEntry {
  /** HS section roman numeral, or "other" for unclassified chapter 99 */
  sectionId: string;
  name: string;
  valueUsd: number;
  share: number;
}

export interface FlowMetrics {
  /** Herfindahl–Hirschman index over partners, 0..1 */
  partnerHhi: number;
  topPartner: { iso3: string; name: string; share: number };
  partnerCount: number;
  /** HHI over HS4 products, 0..1 */
  productHhi: number;
}

export interface DependencyEntry {
  hs6: string;
  productName: string;
  supplierIso3: string;
  supplierName: string;
  /** Share of this product's imports sourced from the top supplier, 0.5..1 */
  share: number;
  totalImportUsd: number;
}

/** Footnote for years where the entity differed (e.g. Belgium–Luxembourg). */
export interface EntityNote {
  throughYear: number;
  note: string;
}

export interface CountryYearSummary {
  iso3: string;
  name: string;
  year: number;
  provisional: boolean;
  /** 'mirror' when this country's exports are estimated from partners' imports. */
  exportsSource: "reported" | "mirror" | null;
  totals: {
    exportsUsd: number | null;
    importsUsd: number | null;
    balanceUsd: number | null;
    exportRank: number | null;
    importRank: number | null;
    rankedCountries: number;
  };
  exportPartners: PartnerEntry[];
  importPartners: PartnerEntry[];
  exportSections: SectionEntry[];
  importSections: SectionEntry[];
  /** null for provisional years (metrics need reconciled full-grain data) */
  metrics: { exports: FlowMetrics; imports: FlowMetrics } | null;
  /** null for provisional years */
  dependencies: DependencyEntry[] | null;
  entityNotes: EntityNote[];
}

export interface WorldCountryEntry {
  iso3: string;
  name: string;
  exportsUsd: number | null;
  importsUsd: number | null;
  /** exports + imports treating null as 0; 0 only when both are null-free zeros */
  totalUsd: number;
  balanceUsd: number | null;
  exportsSource: "reported" | "mirror" | null;
}

export interface WorldSnapshot {
  year: number;
  provisional: boolean;
  world: {
    exportsUsd: number;
    prevYearExportsUsd: number | null;
    /** YoY growth of world exports, e.g. 0.032; null when prev year unavailable */
    growth: number | null;
  };
  countries: WorldCountryEntry[];
}

export interface FlowEntry {
  /** Exporter ISO3 */
  from: string;
  /** Importer ISO3 */
  to: string;
  valueUsd: number;
}

export interface TopFlows {
  year: number;
  provisional: boolean;
  flows: FlowEntry[];
}

export type HsLevel = "hs2" | "hs4" | "hs6";

export interface PairProductEntry {
  code: string;
  name: string;
  level: HsLevel;
  valueUsd: number;
  /** Share of this direction's total, 0..1 */
  share: number;
}

export interface PairDirection {
  /** null = no flows observed this year (never zero) */
  totalUsd: number | null;
  /** This flow as a share of the exporting side's total exports */
  shareOfExportsTotal: number | null;
  /** Top products; HS6 for reconciled years, HS2 for provisional */
  products: PairProductEntry[];
  /** Total product lines observed (products[] may be truncated) */
  productCount: number;
}

export interface PairSummary {
  a: CountryOption;
  b: CountryOption;
  year: number;
  provisional: boolean;
  aToB: PairDirection;
  bToA: PairDirection;
  entityNotes: EntityNote[];
}

export interface PairTrendPoint {
  year: number;
  aToBUsd: number | null;
  bToAUsd: number | null;
  provisional: boolean;
}

export interface PairTrend {
  a: CountryOption;
  b: CountryOption;
  points: PairTrendPoint[];
  entityNotes: EntityNote[];
}

export interface ProductInfo {
  code: string;
  level: HsLevel;
  name: string;
  sectionId: string | null;
  sectionName: string | null;
  chapterCode: string;
  chapterName: string;
}

export interface ProductSummary {
  info: ProductInfo;
  year: number;
  worldTradeUsd: number;
  /** Value-weighted share of world trade with tonnage reported; null for hs2/hs4 */
  quantityValueCoverage: number | null;
  /** USD per tonne; only for HS6 with adequate coverage */
  unitValueUsdPerTonne: number | null;
  topExporters: PartnerEntry[];
  topImporters: PartnerEntry[];
  topRoutes: { fromIso3: string; fromName: string; toIso3: string; toName: string; valueUsd: number }[];
}

export interface ProductTrendPoint {
  year: number;
  valueUsd: number;
  quantityTonnes: number | null;
  unitValueUsdPerTonne: number | null;
}

export interface ProductTrend {
  code: string;
  points: ProductTrendPoint[];
}

export interface ProductSearchResult {
  code: string;
  name: string;
  level: HsLevel;
}

export interface TrendPoint {
  year: number;
  exportsUsd: number | null;
  importsUsd: number | null;
  provisional: boolean;
}

export interface CountryTrend {
  iso3: string;
  name: string;
  points: TrendPoint[];
  entityNotes: EntityNote[];
}
