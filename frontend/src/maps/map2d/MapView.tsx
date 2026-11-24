import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { useStore } from "../../store";
import { useT } from "../../components/i18n/i18n";
import { xyToLonLat } from "../../scenarios/engine/dataset";
import { peakAtPlayhead } from "../twin3d/sim/simController";
import type { Dataset, ScenarioResult } from "../../scenarios/engine/types";
import type { FeatureCollection, Feature } from "geojson";
import { NavPad, type NavApi } from "../../components/NavPad";
import { drainStatics } from "../../scenarios/engine/drains";

type Mode = "baseline" | "scenario" | "delta";

function zonesGeo(ds: Dataset, res: ScenarioResult, base: ScenarioResult, mode: Mode): FeatureCollection {
  const zs = ds.zones.size_m;
  return {
    type: "FeatureCollection",
    features: ds.zones.zones.map((z, i) => {
      const x0 = z.ix * zs, y0 = z.iy * zs, x1 = Math.min(ds.meta.size_m[0], x0 + zs), y1 = Math.min(ds.meta.size_m[1], y0 + zs);
      const ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => xyToLonLat(ds, x, y));
      const v = mode === "baseline" ? base.zones[i].index : mode === "scenario" ? res.zones[i].index : res.zones[i].index - base.zones[i].index;
      return { type: "Feature", properties: { id: z.id, v, band: res.zones[i].band }, geometry: { type: "Polygon", coordinates: [ring] } } as Feature;
    }),
  };
}

function floodGeo(ds: Dataset): FeatureCollection {
  const { nx, ny, cell_m } = ds.grid; const pk = new Float32Array(nx * ny); peakAtPlayhead(pk);
  const feats: Feature[] = [];
  for (let k = 0; k < pk.length; k++) if (pk[k] >= 0.15) {
    const x0 = (k % nx) * cell_m, y0 = Math.floor(k / nx) * cell_m;
    const ring = [[x0, y0], [x0 + cell_m, y0], [x0 + cell_m, y0 + cell_m], [x0, y0 + cell_m], [x0, y0]].map(([x, y]) => xyToLonLat(ds, x, y));
    feats.push({ type: "Feature", properties: { d: pk[k] }, geometry: { type: "Polygon", coordinates: [ring] } });
  }
  return { type: "FeatureCollection", features: feats };
}

export function MapView() {
  const t = useT();
  const el = useRef<HTMLDivElement>(null); const map = useRef<MLMap | null>(null);
  const ds = useStore((s) => s.ds)!; const res = useStore((s) => s.result)!; const base = useStore((s) => s.baseline)!;
  const live = useStore((s) => s.live);
  const drainRisk = useStore((s) => s.layers.drainRisk); const selInlet = useStore((s) => s.selectedInletId);
  const [mode, setMode] = useState<Mode>("scenario"); const [ready, setReady] = useState(false);
  const [showFlood, setShowFlood] = useState(true);

  useEffect(() => {
    const [w, s, e, n] = ds.meta.bbox;
    const m = new maplibregl.Map({
      container: el.current!, bounds: [[w, s], [e, n]], fitBoundsOptions: { padding: 30 }, attributionControl: { compact: true },
      minZoom: 12.5, maxZoom: 19.5, maxPitch: 70, dragRotate: true, pitchWithRotate: true, touchPitch: true, keyboard: true,
      style: {
        version: 8,
        sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" } },
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a0f1c" } },
          { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.5, "raster-saturation": -0.85, "raster-brightness-max": 0.55, "raster-contrast": 0.2 } }],
      },
    });
    map.current = m;
    if (import.meta.env.DEV) (window as unknown as { __map: MLMap }).__map = m; // dev-only debugging handle
    m.on("load", () => {
      const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
      for (const id of ["zones", "flood", "roads", "facilities", "inlets", "buildings"]) m.addSource(id, { type: "geojson", data: empty });
      m.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": ["interpolate", ["linear"], ["get", "v"], -10, "#14b8a6", 0, "#0e3a4a", 35, "#2dd4bf", 48, "#facc15", 60, "#fb923c", 80, "#ef4444"], "fill-opacity": 0.55 } });
      m.addLayer({ id: "zones-line", type: "line", source: "zones", paint: { "line-color": "#0b1220", "line-width": 0.6, "line-opacity": 0.6 } });
      m.addLayer({ id: "buildings-fill", type: "fill-extrusion", source: "buildings", paint: { "fill-extrusion-color": "#a3afc4", "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.72 } });
      m.addLayer({ id: "flood-fill", type: "fill", source: "flood", paint: { "fill-color": ["interpolate", ["linear"], ["get", "d"], 0.15, "#38bdf8", 0.5, "#2563eb", 1, "#9333ea"], "fill-opacity": 0.7 } });
      m.addLayer({ id: "roads-line", type: "line", source: "roads", paint: { "line-color": "#e2e8f0", "line-opacity": 0.5, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 3] } });
      m.addLayer({ id: "inlets-c", type: "circle", source: "inlets", paint: { "circle-radius": ["case", ["get", "sel"], 9, 4], "circle-color": ["case", ["!", ["get", "open"]], "#ef4444", ["==", ["get", "lvl"], "high"], "#f97316", ["==", ["get", "lvl"], "medium"], "#fbbf24", "#22d3ee"], "circle-stroke-color": ["case", ["get", "sel"], "#ffffff", "#0b1220"], "circle-stroke-width": ["case", ["get", "sel"], 3, 1] } });
      m.addLayer({ id: "fac-c", type: "circle", source: "facilities", paint: { "circle-radius": 6, "circle-color": ["match", ["get", "cat"], "health", "#ef4444", "emergency", "#f59e0b", "shelter", "#22c55e", "#94a3b8"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
      m.on("click", "inlets-c", (ev) => { const id = ev.features?.[0]?.properties?.id as string; if (id) { ev.originalEvent.stopPropagation(); useStore.getState().toggleInlet(id); } });
      m.on("click", "zones-fill", (ev) => { const id = ev.features?.[0]?.properties?.id as string; if (id && !ev.defaultPrevented) useStore.getState().selectZone(id); });
      for (const l of ["inlets-c", "zones-fill", "fac-c"]) { m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "pointer")); m.on("mouseleave", l, () => (m.getCanvas().style.cursor = "")); }
      const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      m.on("mousemove", "fac-c", (ev) => { const p = ev.features?.[0]?.properties; if (p) pop.setLngLat(ev.lngLat).setHTML(`<b>${p.name}</b><br>${p.type}`).addTo(m); });
      m.on("mouseleave", "fac-c", () => pop.remove());
      // static layers
      (m.getSource("roads") as GeoJSONSource).setData({ type: "FeatureCollection", features: ds.roads.map((r) => ({ type: "Feature", properties: { id: r.id }, geometry: { type: "LineString", coordinates: r.pts.map(([x, y]) => xyToLonLat(ds, x, y)) } })) });
      (m.getSource("buildings") as GeoJSONSource).setData({ type: "FeatureCollection", features: ds.buildings.map((b) => ({ type: "Feature", properties: { h: b.h }, geometry: { type: "Polygon", coordinates: [[...b.ring, b.ring[0]].map(([x, y]) => xyToLonLat(ds, x, y))] } })) });
      (m.getSource("facilities") as GeoJSONSource).setData({ type: "FeatureCollection", features: ds.facilities.map((f) => ({ type: "Feature", properties: { name: f.name, type: f.amenity.replace(/_/g, " "), cat: f.category }, geometry: { type: "Point", coordinates: xyToLonLat(ds, f.x, f.y) } })) });
      m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
      setReady(true);
    });
    return () => { m.remove(); map.current = null; };
  }, [ds]);

  const nav = useMemo<NavApi>(() => {
    const M = () => map.current!;
    // pending target so quick / held clicks accumulate instead of cancelling each other
    let pending: { bearing: number; pitch: number; zoom: number } | null = null;
    let pendingAt = 0;
    const base = () => (pending && performance.now() - pendingAt < 450 ? pending : { bearing: M().getBearing(), pitch: M().getPitch(), zoom: M().getZoom() });
    const go = (p: Partial<{ bearing: number; pitch: number; zoom: number }>, ms = 170) => {
      pending = { ...base(), ...p }; pendingAt = performance.now();
      M().easeTo({ ...pending, duration: ms });
    };
    const fit = () => { const [w, s, e, n] = ds.meta.bbox; pending = null; M().fitBounds([[w, s], [e, n]], { padding: 30, bearing: 0, pitch: 0, duration: 600 }); };
    return {
      zoomIn: () => go({ zoom: Math.min(19.5, base().zoom + 0.5) }), zoomOut: () => go({ zoom: Math.max(12.5, base().zoom - 0.5) }),
      rotate: (d) => go({ bearing: base().bearing + d * 18 }),
      tilt: (d) => go({ pitch: Math.min(70, Math.max(0, base().pitch - d * 10)) }),
      north: () => go({ bearing: 0 }, 400), reset: fit, top: () => go({ bearing: 0, pitch: 0 }, 450),
      onBearing: (cb) => {
        const m = M(); // capture: the map may already be removed when the cleanup runs
        const h = () => cb(-(m.getBearing() * Math.PI) / 180);
        m.on("rotate", h); h();
        return () => { try { m.off("rotate", h); } catch { /* map already disposed */ } };
      },
    };
  }, [ds]);

  useEffect(() => { if (ready) (map.current!.getSource("zones") as GeoJSONSource).setData(zonesGeo(ds, res, base, mode)); }, [ready, ds, res, base, mode]);
  const statics = useMemo(() => drainStatics(ds), [ds]);
  useEffect(() => {
    if (!ready) return;
    (map.current!.getSource("inlets") as GeoJSONSource).setData({ type: "FeatureCollection", features: ds.inlets.map((inl, i) => ({ type: "Feature", properties: { id: inl.id, open: res.inletOpen[i], lvl: drainRisk ? statics[i].level : "", sel: inl.id === selInlet }, geometry: { type: "Point", coordinates: xyToLonLat(ds, inl.x, inl.y) } })) });
  }, [ready, ds, res.inletOpen, drainRisk, selInlet, statics]);
  useEffect(() => {   // centre the map on the drain picked in the Drains tab
    if (!ready || !selInlet) return;
    const inl = ds.inlets.find((q) => q.id === selInlet); if (!inl) return;
    const [lon, lat] = xyToLonLat(ds, inl.x, inl.y);
    map.current!.easeTo({ center: [lon, lat], zoom: Math.max(map.current!.getZoom(), 17.5), duration: 600 });
  }, [ready, ds, selInlet]);
  const bucket = Math.floor((live?.t ?? 0) / 600);
  useEffect(() => {
    if (!ready) return;
    (map.current!.getSource("flood") as GeoJSONSource).setData(showFlood ? floodGeo(ds) : { type: "FeatureCollection", features: [] });
  }, [ready, ds, showFlood, bucket, res]);

  return (
    <div className="mapwrap">
      <div ref={el} className="map" />
      <div className="map-ctl">
        <div className="seg">
          {(["baseline", "scenario", "delta"] as Mode[]).map((m) => <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{t(`map.${m}`)}</button>)}
        </div>
        <label className="toggle"><input type="checkbox" checked={showFlood} onChange={(e) => setShowFlood(e.target.checked)} /><span>{t("map.flood")}</span></label>
      </div>
      {ready ? <div className="map-nav"><NavPad api={nav} mode="2d" /></div> : null}
      <div className="hint-bar">{t("nav.hint2d")}</div>
      <div className="map-note">{t("map.note")}</div>
    </div>
  );
}
