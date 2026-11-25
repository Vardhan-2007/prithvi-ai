import { Component, Suspense, lazy, useEffect, useRef, type ReactNode } from "react";
import { loadBaselineWater, loadDataset } from "./scenarios/engine/dataset";
import { scenarioFromHash } from "./scenarios/engine/share";
import { useStore } from "./store";
import { Header } from "./components/Header";
import { ScenarioPanel } from "./scenarios/ScenarioPanel";
import { Twin3D } from "./maps/twin3d/Twin3D";
import { Timeline } from "./dashboard/timeline/Timeline";
import { RightPanel } from "./dashboard/risk/RightPanel";
import { CompareView } from "./maps/map2d/CompareView";
import { advance, depthAtPlayhead, statsAtPlayhead } from "./maps/twin3d/sim/simController";
import { computeLive } from "./maps/twin3d/sim/liveStats";
import { api } from "./components/api/client";
import { useT } from "./components/i18n/i18n";

// The 2D map is the only code that needs maplibre-gl (a large library), and the app opens on the 3D view, so the map
// loads on demand. Once the app is up it is fetched quietly in the background, so switching views is still instant.
const loadMapView = () => import("./maps/map2d/MapView").then((m) => ({ default: m.MapView }));
const MapView = lazy(loadMapView);

/** a crash in one view (e.g. WebGL unavailable) shows a message instead of a blank page */
class ViewBoundary extends Component<{ children: ReactNode; resetKey: string }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="boot error"><h2>This view could not start</h2><p>{this.state.err.message}</p><p className="muted">Try another view, or reload. The 3D view needs WebGL.</p></div>;
  }
}

export function App() {
  const t = useT();
  const ds = useStore((s) => s.ds);
  const error = useStore((s) => s.error);
  const view = useStore((s) => s.view);

  useEffect(() => {
    Promise.all([loadDataset(), loadBaselineWater()]).then(([d, bw]) => {
      useStore.getState().init(d, bw);
      const shared = scenarioFromHash(window.location.hash, d);   // a shared link opens its scenario
      if (shared) useStore.getState().applyScenario(shared);
    }).catch((e) => useStore.setState({ error: String(e.message ?? e) }));
    api.health().then(() => useStore.getState().setApiOnline(true)).catch(() => useStore.getState().setApiOnline(false));
  }, []);

  // warm the 2D map chunk once the app is showing, off the critical path
  useEffect(() => {
    if (!ds) return;
    const warm = () => { void loadMapView().catch(() => undefined); };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = idle ? idle(warm, { timeout: 5000 }) : window.setTimeout(warm, 3000);
    return () => { if (idle) (window as unknown as { cancelIdleCallback: (n: number) => void }).cancelIdleCallback(id); else clearTimeout(id); };
  }, [ds]);

  // one global loop: playback + live stats (4 Hz)
  const raf = useRef(0);
  useEffect(() => {
    if (!ds) return;
    let last = performance.now(), lastStats = 0;
    const buf = new Float32Array(ds.grid.nx * ds.grid.ny);
    const loop = (now: number) => {
      raf.current = requestAnimationFrame(loop);
      const dt = (now - last) / 1000; last = now;
      advance(dt);
      if (now - lastStats > 250) {
        lastStats = now;
        if (depthAtPlayhead(buf)) {
          const s = useStore.getState();
          s.setLive(computeLive(ds, buf, statsAtPlayhead(), s.routeThreshold));
        }
      }
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [ds]);

  if (error) return <div className="boot error"><h2>PRITHVI AI</h2><p>{error}</p></div>;
  if (!ds) return <div className="boot"><div className="spinner" /><p>{t("app.loading")}</p></div>;
  return (
    <div className="app">
      <Header />
      <main className="main">
        <ScenarioPanel />
        <section className="center">
          <div className="stage">
            <ViewBoundary resetKey={view}>
              <Suspense fallback={<div className="boot"><div className="spinner" /></div>}>
                {view === "3d" ? <Twin3D /> : view === "map" ? <MapView /> : <CompareView />}
              </Suspense>
            </ViewBoundary>
          </div>
          <Timeline />
        </section>
        <RightPanel />
      </main>
      <div className="disclaimer">{t("disclaimer")}</div>
    </div>
  );
}
