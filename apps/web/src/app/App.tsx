import { Component, useEffect, useRef, type ReactNode } from "react";
import { loadDataset } from "../shared/engine/dataset";
import { useStore } from "./store";
import { Header } from "./Header";
import { ScenarioPanel } from "../features/scenarios/ScenarioPanel";
import { Twin3D } from "../features/twin3d/Twin3D";
import { Timeline } from "../features/timeline/Timeline";
import { RightPanel } from "../features/risk-panel/RightPanel";
import { MapView } from "../features/map/MapView";
import { CompareView } from "../features/map/CompareView";
import { advance, depthAtPlayhead, statsAtPlayhead } from "../features/twin3d/sim/simController";
import { computeLive } from "../features/twin3d/sim/liveStats";
import { api } from "../shared/api/client";
import { useT } from "../shared/utils/i18n";

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
    loadDataset().then((d) => useStore.getState().init(d)).catch((e) => useStore.setState({ error: String(e.message ?? e) }));
    api.health().then(() => useStore.getState().setApiOnline(true)).catch(() => useStore.getState().setApiOnline(false));
  }, []);

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
            <ViewBoundary resetKey={view}>{view === "3d" ? <Twin3D /> : view === "map" ? <MapView /> : <CompareView />}</ViewBoundary>
          </div>
          <Timeline />
        </section>
        <RightPanel />
      </main>
      <div className="disclaimer">{t("disclaimer")}</div>
    </div>
  );
}
