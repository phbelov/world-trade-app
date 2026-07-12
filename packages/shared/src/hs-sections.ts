import type { HsSection } from "./index.ts";

/**
 * The 21 sections of the Harmonized System — a stable international standard
 * (unchanged across HS revisions). Chapter ranges are inclusive.
 * Names are shortened for UI display; official titles are much longer.
 */
export const HS_SECTIONS: HsSection[] = [
  { id: "I", name: "Animals & animal products", chapters: [[1, 5]] },
  { id: "II", name: "Vegetable products", chapters: [[6, 14]] },
  { id: "III", name: "Animal & vegetable fats and oils", chapters: [[15, 15]] },
  { id: "IV", name: "Prepared foodstuffs, beverages & tobacco", chapters: [[16, 24]] },
  { id: "V", name: "Mineral products", chapters: [[25, 27]] },
  { id: "VI", name: "Chemical products", chapters: [[28, 38]] },
  { id: "VII", name: "Plastics & rubber", chapters: [[39, 40]] },
  { id: "VIII", name: "Hides, skins & leather", chapters: [[41, 43]] },
  { id: "IX", name: "Wood & wood products", chapters: [[44, 46]] },
  { id: "X", name: "Pulp, paper & printed matter", chapters: [[47, 49]] },
  { id: "XI", name: "Textiles & apparel", chapters: [[50, 63]] },
  { id: "XII", name: "Footwear & headgear", chapters: [[64, 67]] },
  { id: "XIII", name: "Stone, ceramic & glass", chapters: [[68, 70]] },
  { id: "XIV", name: "Precious metals & stones", chapters: [[71, 71]] },
  { id: "XV", name: "Base metals", chapters: [[72, 83]] },
  { id: "XVI", name: "Machinery & electrical equipment", chapters: [[84, 85]] },
  { id: "XVII", name: "Transport equipment", chapters: [[86, 89]] },
  { id: "XVIII", name: "Precision & optical instruments", chapters: [[90, 92]] },
  { id: "XIX", name: "Arms & ammunition", chapters: [[93, 93]] },
  { id: "XX", name: "Miscellaneous manufactured articles", chapters: [[94, 96]] },
  { id: "XXI", name: "Works of art & antiques", chapters: [[97, 97]] },
];

/** Map an HS2 chapter number (1–97) to its section id; null if out of range. */
export function chapterToSection(chapter: number): string | null {
  for (const s of HS_SECTIONS) {
    for (const [lo, hi] of s.chapters) {
      if (chapter >= lo && chapter <= hi) return s.id;
    }
  }
  return null;
}
