import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { TwinScene, VERT_EXAGGERATION, type HoverInfo } from "./scene/TwinScene";
import { simData, depthAtPlayhead, peakAtPlayhead } from "./sim/simController";
import { rainRateMmH } from "./sim/floodSolver";
import { xyToLonLat } from "../../scenarios/engine/dataset";
import { BAND_COLORS } from "../../scenarios/engine/risk";
import { useT } from "../../components/i18n/i18n";
import { useRoute } from "../../dashboard/risk/useRoute";
import { NavPad, type NavApi } from "../../components/NavPad";

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `T+${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export function Twin3D() {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TwinScene | null>(null);
  const [hover, setHover] = useState<{ info: HoverInfo; x: number; y: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const [nav, setNav] = useState<NavApi | null>(null);
  const ds = useStore((s) => s.ds)!;
  const layers = useStore((s) => s.layers);
  const result = useStore((s) => s.result)!;
  const baseline = useStore((s) => s.baseline)!;
  const scenario = useStore((s) => s.scenario);
  const selected = useStore((s) => s.selectedZoneId);
  const live = useStore((s) => s.live);
  const routeThreshold = useStore((s) => s.routeThreshold);
  const tab = useStore((s) => s.tab);
  const route = useRoute();
  const store = useStore;

  // refs so the (stable) scene callbacks always see the latest data
  const latest = useRef({ result, baseline, live, ds });
  latest.current = { result, baseline, live, ds };

  useEffect(() => {
    const scene = new TwinScene(host.current!, ds, {
      onZone: (id) => store.getState().selectZone(id),
      onInlet: (id) => store.getState().toggleInlet(id),
      onHover: (info, x, y) => setHover(info ? { info, x, y } : null),
    });
    scene.hoverFormatter = (kind, id) => {
      const { result: r, baseline: b, ds: d } = latest.current;
      if (kind === "zone") {
        const i = d.zones.zones.findIndex((z) => z.id === id); if (i < 0) return null;
        const z = r.zones[i];
        return { kind, id, title: id, lines: [`Risk index ${z.index.toFixed(1)} · ${z.band}`, `Δ vs baseline ${(z.index - b.zones[i].index >= 0 ? "+" : "")}${(z.index - b.zones[i].index).toFixed(1)}`, "Click: explain this zone"] };
      }
      if (kind === "facility") { const f = d.facilities.find((q) => q.id === id)!; return { kind, id, title: f.name, lines: [f.amenity.replace(/_/g, " "), "OSM-mapped · status unknown"] }; }
      const i = d.inlets.findIndex((q) => q.id === id); const open = r.inletOpen[i];
      return { kind, id, title: `${id} (proxy inlet)`, lines: [open ? "Open — click to mark blocked" : "Blocked — click to clear", "Assumed location, not a survey"] };
    };
    sceneRef.current = scene; setNav(scene.nav);
    if (import.meta.env.DEV) (window as unknown as { __scene: TwinScene }).__scene = scene; // dev-only debugging handle
    let lastVersion = -1, lastPeak = false;
    const buf = new Float32Array(ds.grid.nx * ds.grid.ny);
    scene.onFrame = () => {
      const peak = store.getState().layers.peak;
      if (simData.version !== lastVersion || peak !== lastPeak) {
        lastVersion = simData.version; lastPeak = peak;
        const ok = peak ? peakAtPlayhead(buf) : depthAtPlayhead(buf);
        if (ok) scene.setDepth(buf);
        const rate = rainRateMmH(simData.playhead, simData.rainMm, simData.durationH);
        scene.setRainIntensity(Math.min(1, rate / 60));
      }
    };
    return () => { scene.dispose(); sceneRef.current = null; setNav(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds]);

  useEffect(() => { sceneRef.current?.setLayers(layers); }, [layers]);
  useEffect(() => { sceneRef.current?.setRisk(layers.risk, result, baseline); }, [layers.risk, result, baseline]);
  useEffect(() => { sceneRef.current?.setInlets(result.inletOpen, scenario.overrides); }, [result.inletOpen, scenario.overrides]);
  useEffect(() => { sceneRef.current?.setPumps(result.pumpSites); }, [result.pumpSites]);
  useEffect(() => { sceneRef.current?.setSelected(selected ? ds.zones.zones.find((z) => z.id === selected) ?? null : null); }, [selected, ds]);
  useEffect(() => { sceneRef.current?.setRoadThreshold(routeThreshold); }, [routeThreshold]);
  useEffect(() => {
    if (tab === "routes" && route) sceneRef.current?.setRoute(route.scn.found ? route.scn.path : route.base.path, route.scn.found);
    else sceneRef.current?.setRoute(null, true);
  }, [route, tab]);
  useEffect(() => { sceneRef.current?.setAutoRotate(auto); }, [auto]);

  const [lon, lat] = xyToLonLat(ds, ds.meta.size_m[0] / 2, ds.meta.size_m[1] / 2);
  return (
    <div className="twin">
      <div ref={host} className="twin-canvas" />
      <div className="hud hud-tl">
        <div className="hud-title">{t("hud.custom")}</div>
        <div className="hud-sub">{lat.toFixed(4)}°N, {lon.toFixed(4)}°E</div>
        <div className="hud-sub">{ds.meta.name}</div>
        <div className="hud-clock">{fmtClock(live?.t ?? 0)}</div>
        <div className="hud-sub">{t("hud.exag", { n: VERT_EXAGGERATION })}</div>
      </div>
      <div className="hud hud-tr">
        <button className="chip" onClick={() => sceneRef.current?.resetView("persp")}>{t("hud.persp")}</button>
        <button className="chip" onClick={() => sceneRef.current?.resetView("top")}>{t("hud.top")}</button>
        <button className={"chip" + (auto ? " on" : "")} onClick={() => setAuto(!auto)}>{t("hud.orbit")}</button>
      </div>
      <div className="hud hud-bl">
        {layers.risk !== "off" ? (
          <div className="legend">
            <div className="legend-title">{layers.risk === "index" ? t("legend.index") : t("legend.delta")}</div>
            {layers.risk === "index"
              ? (["lower", "moderate", "higher", "highest"] as const).map((b) => <div key={b} className="legend-row"><i style={{ background: BAND_COLORS[b] }} />{t(`band.${b}`)}</div>)
              : <><div className="legend-row"><i style={{ background: "#f43f5e" }} />{t("legend.up")}</div><div className="legend-row"><i style={{ background: "#2dd4bf" }} />{t("legend.down")}</div></>}
          </div>
        ) : null}
        <div className="legend">
          <div className="legend-title">{layers.peak ? t("legend.peak") : t("legend.depth")}</div>
          <div className="depth-bar" />
          <div className="depth-scale"><span>0</span><span>0.4</span><span>0.8</span><span>1.2+ m</span></div>
        </div>
      </div>
      <div className="hint-bar">{t("nav.hint3d")}</div>
      {nav ? <div className="hud hud-nav"><NavPad api={nav} mode="3d" /></div> : null}
      {hover ? (
        <div className="tooltip" style={{ left: Math.min(hover.x + 14, (host.current?.clientWidth ?? 600) - 230), top: hover.y + 14 }}>
          <b>{hover.info.title}</b>{hover.info.lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      ) : null}
    </div>
  );
}
