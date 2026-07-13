import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { scaleQuantile, scaleSqrt } from "d3-scale";
import { extent } from "d3-array";
import type { Feature } from "geojson";
import type { FlowEntry, WorldCountryEntry } from "@world-trade/shared/api";
import type { Theme } from "../theme.tsx";
import { loadGeo, type GeoData } from "../lib/geo.ts";
import { measureValue, type Measure } from "../lib/measures.ts";
import { fmtUsd } from "../lib/format.ts";

/*
 * MapLibre provides ONLY the camera and background here — all geometry
 * (country fills, borders, arcs, markers) renders through deck.gl on the
 * main thread. MapLibre's worker-based GeoJSON pipeline stalls on
 * Chromium 150 (blank layers, map never reaches idle), so we bypass it.
 *
 * Minimal ramps (low→high) per theme: grayscale ink for exports/total,
 * hyperlink blue for imports, red↔green only for balance.
 */
const RAMP = {
  light: {
    ink: ["#f0f0f0", "#dcdcdc", "#c2c2c2", "#a1a1a1", "#7c7c7c", "#4c4c4c", "#111111"],
    blue: ["#eaeeff", "#ccd6ff", "#a8baff", "#7f97fa", "#5670ee", "#2f4cdd", "#1233bd"],
    neg: ["#f5bdb5", "#ee9184", "#e56052", "#d32f1d"],
    pos: ["#bcdcbe", "#92c797", "#62ae6b", "#2c8a39"],
    noData: "#fafafa",
    border: "#d4d4d4",
    selected: "#111111",
  },
  dark: {
    ink: ["#454545", "#575757", "#6c6c6c", "#868686", "#a4a4a4", "#cccccc", "#f5f5f5"],
    blue: ["#3d4870", "#4a5c94", "#5b73b8", "#7189d6", "#8aa2ee", "#a6bcff", "#c8d6ff"],
    neg: ["#7a3b34", "#a54a3f", "#d05a4c", "#ff6b5e"],
    pos: ["#3d6a42", "#4d8a54", "#56a95f", "#5fc768"],
    noData: "#3b3b3b",
    border: "#5a5a5a",
    selected: "#f5f5f5",
  },
} as const;

const ARC = {
  light: { source: [17, 17, 17, 185], target: [20, 64, 255, 185] },
  dark: { source: [245, 245, 245, 175], target: [138, 166, 255, 185] },
} as const;

type Rgba = [number, number, number, number];

function hexToRgba(hex: string, alpha = 255): Rgba {
  const h = hex.slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    alpha,
  ];
}

interface Props {
  countries: WorldCountryEntry[];
  flows: FlowEntry[];
  measure: Measure;
  provisional: boolean;
  selected: string | null;
  onSelect: (iso3: string | null) => void;
  theme: Theme;
}

interface Hover {
  iso3: string;
  x: number;
  y: number;
}

/** iso3 → fill color for the current measure (diverging ramp for balance). */
function buildColors(
  countries: WorldCountryEntry[],
  measure: Measure,
  theme: Theme,
): Map<string, string> {
  const ramp = RAMP[theme];
  const out = new Map<string, string>();
  const values = countries
    .map((c) => ({ iso3: c.iso3, v: measureValue(c, measure) }))
    .filter((d): d is { iso3: string; v: number } => d.v != null);

  if (measure === "balance") {
    const neg = values.filter((d) => d.v < 0).map((d) => -d.v);
    const pos = values.filter((d) => d.v > 0).map((d) => d.v);
    const negScale = scaleQuantile(neg, [...ramp.neg]);
    const posScale = scaleQuantile(pos, [...ramp.pos]);
    for (const { iso3, v } of values) {
      out.set(iso3, v < 0 ? negScale(-v) : v > 0 ? posScale(v) : ramp.noData);
    }
  } else {
    const rampColors = measure === "imports" ? ramp.blue : ramp.ink;
    const scale = scaleQuantile(
      values.map((d) => d.v),
      [...rampColors],
    );
    for (const { iso3, v } of values) out.set(iso3, scale(v));
  }
  return out;
}

const iso3Of = (f: Feature): string => (f.properties as { iso3: string }).iso3;

export function TradeMap({
  countries,
  flows,
  measure,
  provisional,
  selected,
  onSelect,
  theme,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);

  const byIso3 = useMemo(
    () => new Map(countries.map((c) => [c.iso3, c])),
    [countries],
  );
  const colors = useMemo(
    () => buildColors(countries, measure, theme),
    [countries, measure, theme],
  );

  useEffect(() => {
    loadGeo().then(setGeo, () => setGeoError(true));
  }, []);

  // Keep the latest onSelect without re-creating the map.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  /** GPU-pick a country (polygon or microstate dot) at a screen point. */
  const pickIso3 = (x: number, y: number): string | null => {
    const overlay = overlayRef.current as
      | (MapboxOverlay & {
          pickObject: (opts: {
            x: number;
            y: number;
            radius?: number;
            layerIds?: string[];
          }) => { object?: unknown } | null;
        })
      | null;
    if (!overlay?.pickObject) return null;
    const info = overlay.pickObject({
      x,
      y,
      radius: 2,
      layerIds: ["countries", "microstates"],
    });
    const obj = info?.object as
      | Feature
      | { iso3: string }
      | undefined;
    if (!obj) return null;
    return "iso3" in obj ? obj.iso3 : iso3Of(obj);
  };

  // Map lifecycle — camera + background only; created once per geo load.
  useEffect(() => {
    if (!geo || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      // No layers at all: the canvas stays transparent and the ocean is the
      // container's CSS background — instant theme response, zero style work.
      style: { version: 8, sources: {}, layers: [] },
      center: [12, 24],
      zoom: 1.15,
      minZoom: 0.7,
      maxZoom: 6,
      attributionControl: false,
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    const overlay = new MapboxOverlay({ layers: [] });
    map.addControl(overlay);
    overlayRef.current = overlay;
    map.on("error", (e) => console.error("maplibre error:", e.error));

    // Chromium 150 delays "load" by many seconds even for an empty style;
    // deck.gl only needs the camera, so don't hold rendering hostage to it.
    map.once("load", () => setReady(true));
    const readyFallback = window.setTimeout(() => setReady(true), 800);

    map.on("click", (e) => {
      onSelectRef.current(pickIso3(e.point.x, e.point.y));
    });
    map.on("mousemove", (e) => {
      const iso3 = pickIso3(e.point.x, e.point.y);
      map.getCanvas().style.cursor = iso3 ? "pointer" : "";
      setHover(iso3 ? { iso3, x: e.point.x, y: e.point.y } : null);
    });
    map.getCanvas().addEventListener("mouseleave", () => setHover(null));

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    mapRef.current = map;
    return () => {
      window.clearTimeout(readyFallback);
      ro.disconnect();
      setReady(false);
      mapRef.current = null;
      overlayRef.current = null;
      map.remove();
    };
  }, [geo]);

  // All geometry renders through deck.gl.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !ready || !geo) return;
    const chrome = RAMP[theme];
    const arcColors = ARC[theme];
    const noData = hexToRgba(chrome.noData);
    const border = hexToRgba(chrome.border);
    const selectedColor = hexToRgba(chrome.selected);

    const arcs = flows.filter(
      (f) => geo.centroids.has(f.from) && geo.centroids.has(f.to),
    );
    const [minV, maxV] = extent(arcs, (f) => f.valueUsd);
    const width = scaleSqrt([minV ?? 0, maxV ?? 1], [1.2, 6.5]);

    const points = countries
      .filter((c) => !geo.polygonIso3.has(c.iso3) && geo.centroids.has(c.iso3))
      .map((c) => ({
        iso3: c.iso3,
        position: geo.centroids.get(c.iso3)!,
        color: colors.get(c.iso3),
      }));

    overlay.setProps({
      layers: [
        new GeoJsonLayer({
          id: "countries",
          data: geo.fc,
          filled: true,
          stroked: true,
          getFillColor: (f: Feature) => {
            const hex = colors.get(iso3Of(f));
            return hex ? hexToRgba(hex) : noData;
          },
          getLineColor: (f: Feature) =>
            iso3Of(f) === selected ? selectedColor : border,
          getLineWidth: (f: Feature) => (iso3Of(f) === selected ? 1.8 : 0.5),
          lineWidthUnits: "pixels",
          lineWidthMinPixels: 0.4,
          pickable: true,
          updateTriggers: {
            getFillColor: [colors, theme],
            getLineColor: [selected, theme],
            getLineWidth: [selected],
          },
        }),
        new ScatterplotLayer({
          id: "microstates",
          data: points,
          getPosition: (d) => d.position,
          getFillColor: (d) =>
            d.color
              ? hexToRgba(d.color)
              : theme === "dark"
                ? [90, 90, 90, 255]
                : [212, 212, 212, 255],
          radiusMinPixels: 3,
          radiusMaxPixels: 3,
          stroked: true,
          getLineColor:
            theme === "dark" ? [245, 245, 245, 160] : [17, 17, 17, 120],
          lineWidthMinPixels: 0.6,
          pickable: true,
          updateTriggers: { getFillColor: [colors, theme] },
        }),
        new ArcLayer({
          id: "flows",
          data: arcs,
          getSourcePosition: (d: FlowEntry) => geo.centroids.get(d.from)!,
          getTargetPosition: (d: FlowEntry) => geo.centroids.get(d.to)!,
          getWidth: (d: FlowEntry) => width(d.valueUsd),
          getSourceColor: arcColors.source as unknown as Rgba,
          getTargetColor: arcColors.target as unknown as Rgba,
          getHeight: 0.6,
          updateTriggers: { getWidth: [minV, maxV] },
        }),
      ],
    });
  }, [flows, countries, colors, ready, geo, theme, selected]);

  const hovered = hover ? byIso3.get(hover.iso3) : null;
  const hoverName =
    hovered?.name ??
    (hover
      ? (geo?.fc.features.find((f) => iso3Of(f) === hover.iso3)
          ?.properties as { name?: string } | undefined)?.name
      : null);

  if (geoError) {
    return (
      <div className="flex h-full items-center justify-center border border-line text-sm text-ink-muted">
        Map geometry failed to load. The rankings on the right still work.
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden border border-line">
      <div ref={containerRef} className="h-full w-full bg-bg" />
      {!ready && (
        <div className="absolute inset-0 skeleton" aria-label="Loading map" />
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-64 border border-line bg-bg px-3 py-2 text-xs"
          style={{
            left: Math.min(
              hover.x + 12,
              (containerRef.current?.clientWidth ?? 400) - 200,
            ),
            top: hover.y + 12,
          }}
        >
          <div className="text-sm font-medium">{hoverName ?? hover.iso3}</div>
          {hovered ? (
            <div className="mt-1 space-y-0.5 tnum text-ink-muted">
              <div>
                Exports{" "}
                {hovered.exportsUsd != null ? fmtUsd(hovered.exportsUsd) : "—"}
                {hovered.exportsSource === "mirror" && " (est.)"}
              </div>
              <div>
                Imports{" "}
                {hovered.importsUsd != null ? fmtUsd(hovered.importsUsd) : "—"}
              </div>
              {provisional && (
                <div className="text-provisional">provisional</div>
              )}
            </div>
          ) : (
            <div className="mt-1 text-ink-muted">No trade data reported</div>
          )}
        </div>
      )}
    </div>
  );
}
