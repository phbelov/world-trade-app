import { geoArea, geoCentroid } from "d3-geo";
import type { Feature, FeatureCollection, Polygon } from "geojson";

/**
 * Major traders with no polygon at Natural Earth 110m resolution — rendered
 * as point markers and used as arc endpoints. [lon, lat].
 */
export const MICROSTATE_COORDS: Record<string, [number, number]> = {
  SGP: [103.82, 1.35],
  HKG: [114.17, 22.3],
  MAC: [113.55, 22.19],
  MLT: [14.4, 35.9],
  BHR: [50.55, 26.05],
  MUS: [57.55, -20.3],
  SYC: [55.45, -4.62],
  MDV: [73.4, 3.2],
  BRB: [-59.55, 13.15],
  COM: [43.35, -11.7],
  CPV: [-23.6, 15.1],
  STP: [6.72, 0.33],
  AND: [1.52, 42.55],
  BMU: [-64.75, 32.3],
  PYF: [-149.45, -17.65],
  NCL: [165.6, -21.3],
  WSM: [-172.3, -13.75],
  TON: [-175.2, -21.18],
  FSM: [158.2, 6.92],
  PLW: [134.58, 7.5],
  MHL: [171.18, 7.11],
  KIR: [172.98, 1.42],
  NRU: [166.93, -0.53],
  TUV: [179.2, -8.5],
  GRD: [-61.68, 12.11],
  LCA: [-60.98, 13.9],
  VCT: [-61.2, 13.25],
  ATG: [-61.8, 17.07],
  KNA: [-62.75, 17.3],
  DMA: [-61.37, 15.42],
  ABW: [-69.97, 12.52],
  CYM: [-81.25, 19.31],
};

export interface GeoData {
  fc: FeatureCollection;
  /** Arc endpoints per ISO3: largest-polygon centroid, or microstate coord. */
  centroids: Map<string, [number, number]>;
  /** ISO3s that have a polygon (everything else may need a point marker). */
  polygonIso3: Set<string>;
}

/** Centroid of the largest polygon — keeps France in France, USA in CONUS. */
function centroidOf(f: Feature): [number, number] {
  const g = f.geometry;
  if (g.type === "MultiPolygon") {
    let best: Polygon | null = null;
    let bestArea = -1;
    for (const coords of g.coordinates) {
      const poly: Polygon = { type: "Polygon", coordinates: coords };
      let a = geoArea(poly);
      // Reversed winding yields the sphere complement; normalize.
      if (a > 2 * Math.PI) a = 4 * Math.PI - a;
      if (a > bestArea) {
        bestArea = a;
        best = poly;
      }
    }
    if (best) return geoCentroid(best);
  }
  return geoCentroid(g);
}

let cached: Promise<GeoData> | null = null;

export function loadGeo(): Promise<GeoData> {
  cached ??= fetch("/geo/countries.json")
    .then((r) => {
      if (!r.ok) throw new Error(`geo fetch failed: ${r.status}`);
      return r.json() as Promise<FeatureCollection>;
    })
    .then((fc) => {
      const centroids = new Map<string, [number, number]>();
      const polygonIso3 = new Set<string>();
      for (const f of fc.features) {
        const iso3 = (f.properties as { iso3: string }).iso3;
        polygonIso3.add(iso3);
        centroids.set(iso3, centroidOf(f));
      }
      for (const [iso3, coord] of Object.entries(MICROSTATE_COORDS)) {
        if (!centroids.has(iso3)) centroids.set(iso3, coord);
      }
      return { fc, centroids, polygonIso3 };
    });
  return cached;
}
