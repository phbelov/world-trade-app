import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer, ScatterplotLayer } from "@deck.gl/layers";
import { scaleQuantile, scaleSqrt } from "d3-scale";
import { extent } from "d3-array";
import type { FlowEntry, WorldCountryEntry } from "@world-trade/shared/api";
import type { Theme } from "../theme.tsx";
import { loadGeo, type GeoData } from "../lib/geo.ts";
import { measureValue, type Measure } from "../lib/measures.ts";
import { fmtUsd } from "../lib/format.ts";

/* Sequential ramps (light→dark = low→high) and map chrome per theme. */
const RAMP = {
  light: {
    teal: ["#e4efed", "#c4deda", "#9cc9c3", "#6fb0a8", "#45968c", "#22796f", "#0b5d55"],
    orange: ["#f7ead9", "#eed3b1", "#e4b988", "#d99c5e", "#c97f39", "#b0621c", "#8f4c0d"],
    noData: "#efede6",
    border: "#c9c4b4",
    ocean: "#faf9f5",
    selected: "#1d1c18",
  },
  dark: {
    teal: ["#12352f", "#164439", "#1c554a", "#23695c", "#2c7f70", "#379787", "#5eead4"],
    orange: ["#3a2812", "#4a3315", "#5d3f18", "#734d1b", "#8b5c1e", "#a56d22", "#fdba74"],
    noData: "#20232a",
    border: "#3d414c",
    ocean: "#14161a",
    selected: "#e8e6df",
  },
} as const;

const ARC = {
  light: { source: [15, 118, 110, 200], target: [194, 98, 14, 200] },
  dark: { source: [45, 212, 191, 190], target: [251, 146, 60, 190] },
} as const;

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
    const negScale = scaleQuantile(neg, ramp.orange.slice(2, 6));
    const posScale = scaleQuantile(pos, ramp.teal.slice(2, 6));
    for (const { iso3, v } of values) {
      out.set(iso3, v < 0 ? negScale(-v) : v > 0 ? posScale(v) : ramp.noData);
    }
  } else {
    const rampColors = measure === "imports" ? ramp.orange : ramp.teal;
    const scale = scaleQuantile(
      values.map((d) => d.v),
      rampColors,
    );
    for (const { iso3, v } of values) out.set(iso3, scale(v));
  }
  return out;
}

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
  const prevSelected = useRef<string | null>(null);

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

  // Map lifecycle — created once per geo load, torn down on unmount.
  useEffect(() => {
    if (!geo || !containerRef.current) return;
    const chrome = RAMP[document.documentElement.dataset.theme === "dark" ? "dark" : "light"];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "bg",
            type: "background",
            paint: { "background-color": chrome.ocean },
          },
        ],
      },
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

    map.on("load", () => {
      map.addSource("countries", {
        type: "geojson",
        data: geo.fc,
        promoteId: "iso3",
      });
      map.addLayer({
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": ["coalesce", ["feature-state", "fill"], chrome.noData],
        },
      });
      map.addLayer({
        id: "country-line",
        type: "line",
        source: "countries",
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            chrome.selected,
            chrome.border,
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1.8,
            0.5,
          ],
        },
      });
      setReady(true);
    });

    map.on("click", (e) => {
      if (!map.getLayer("country-fill")) return;
      const feats = map.queryRenderedFeatures(e.point, {
        layers: ["country-fill"],
      });
      const iso3 = feats[0]?.properties?.iso3 as string | undefined;
      onSelectRef.current(iso3 ?? null);
    });
    map.on("mousemove", (e) => {
      if (!map.getLayer("country-fill")) return;
      const feats = map.queryRenderedFeatures(e.point, {
        layers: ["country-fill"],
      });
      const iso3 = feats[0]?.properties?.iso3 as string | undefined;
      map.getCanvas().style.cursor = iso3 ? "pointer" : "";
      setHover(iso3 ? { iso3, x: e.point.x, y: e.point.y } : null);
    });
    map.getCanvas().addEventListener("mouseleave", () => setHover(null));

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    mapRef.current = map;
    return () => {
      ro.disconnect();
      setReady(false);
      mapRef.current = null;
      overlayRef.current = null;
      map.remove();
    };
  }, [geo]);

  // Keep the latest onSelect without re-creating the map.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Choropleth + chrome colors.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !geo) return;
    const chrome = RAMP[theme];
    map.setPaintProperty("bg", "background-color", chrome.ocean);
    map.setPaintProperty("country-fill", "fill-color", [
      "coalesce",
      ["feature-state", "fill"],
      chrome.noData,
    ]);
    map.setPaintProperty("country-line", "line-color", [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      chrome.selected,
      chrome.border,
    ]);
    for (const iso3 of geo.polygonIso3) {
      map.setFeatureState(
        { source: "countries", id: iso3 },
        { fill: colors.get(iso3) ?? null },
      );
    }
  }, [colors, ready, geo, theme]);

  // Selection highlight.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (prevSelected.current) {
      map.setFeatureState(
        { source: "countries", id: prevSelected.current },
        { selected: false },
      );
    }
    if (selected && geo?.polygonIso3.has(selected)) {
      map.setFeatureState(
        { source: "countries", id: selected },
        { selected: true },
      );
    }
    prevSelected.current = selected;
  }, [selected, ready, geo]);

  // deck.gl layers: flow arcs + microstate points.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !ready || !geo) return;
    const arcColors = ARC[theme];
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
        new ScatterplotLayer({
          id: "microstates",
          data: points,
          getPosition: (d) => d.position,
          getFillColor: (d) => {
            if (!d.color) return theme === "dark" ? [61, 65, 76, 255] : [201, 196, 180, 255];
            const [r, g, b] = d.color
              .slice(1)
              .match(/../g)!
              .map((h: string) => parseInt(h, 16));
            return [r!, g!, b!, 255];
          },
          radiusMinPixels: 3,
          radiusMaxPixels: 3,
          stroked: true,
          getLineColor: theme === "dark" ? [232, 230, 223, 160] : [29, 28, 24, 120],
          lineWidthMinPixels: 0.6,
          pickable: true,
          onClick: (info) =>
            onSelectRef.current((info.object as { iso3: string }).iso3),
          updateTriggers: { getFillColor: [colors, theme] },
        }),
        new ArcLayer({
          id: "flows",
          data: arcs,
          getSourcePosition: (d: FlowEntry) => geo.centroids.get(d.from)!,
          getTargetPosition: (d: FlowEntry) => geo.centroids.get(d.to)!,
          getWidth: (d: FlowEntry) => width(d.valueUsd),
          getSourceColor: arcColors.source as unknown as [number, number, number, number],
          getTargetColor: arcColors.target as unknown as [number, number, number, number],
          getHeight: 0.6,
          updateTriggers: { getWidth: [minV, maxV] },
        }),
      ],
    });
  }, [flows, countries, colors, ready, geo, theme]);

  const hovered = hover ? byIso3.get(hover.iso3) : null;
  const hoverName =
    hovered?.name ??
    (hover
      ? (geo?.fc.features.find(
          (f) => (f.properties as { iso3: string }).iso3 === hover.iso3,
        )?.properties as { name?: string } | undefined)?.name
      : null);

  if (geoError) {
    return (
      <div className="flex h-full items-center justify-center rounded border border-line bg-surface text-sm text-ink-muted">
        Map geometry failed to load. The rankings on the right still work.
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden rounded border border-line">
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 skeleton" aria-label="Loading map" />
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-64 rounded border border-line bg-surface px-3 py-2 text-xs shadow-sm"
          style={{
            left: Math.min(hover.x + 12, (containerRef.current?.clientWidth ?? 400) - 200),
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
