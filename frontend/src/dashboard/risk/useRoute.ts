import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../store";
import { facilityNode, shortestPath, edgeDepths, type RouteResult } from "../../scenarios/engine/routing";
import { graphFor } from "../../maps/twin3d/sim/liveStats";
import { peakAtPlayhead } from "../../maps/twin3d/sim/simController";
import { SNAP_S } from "../../maps/twin3d/sim/floodSolver";

export interface RouteAnalysis { base: RouteResult; scn: RouteResult; blockedKm: number; from: string; to: string }

/** Re-runs the graph analysis as the simulation advances (peak depth so far along each road segment). */
export function useRoute(): RouteAnalysis | null {
  const { ds, routeFrom, routeTo, routeThreshold, live, simRunKey } = useStore(useShallow((s) => ({
    ds: s.ds, routeFrom: s.routeFrom, routeTo: s.routeTo, routeThreshold: s.routeThreshold, live: s.live, simRunKey: s.simRunKey,
  })));
  const bucket = Math.floor((live?.t ?? 0) / SNAP_S);
  return useMemo(() => {
    if (!ds || !routeFrom || !routeTo || routeFrom === routeTo) return null;
    const fa = ds.facilities.find((f) => f.id === routeFrom), fb = ds.facilities.find((f) => f.id === routeTo);
    if (!fa || !fb) return null;
    const g = graphFor(ds);
    const a = facilityNode(g, fa), b = facilityNode(g, fb);
    if (!a || !b) return null;
    const { nx, ny, cell_m } = ds.grid;
    const peak = new Float32Array(nx * ny); peakAtPlayhead(peak);
    const ed = edgeDepths(g, peak, nx, ny, cell_m);
    const base = shortestPath(g, a, b);
    const scn = shortestPath(g, a, b, (e) => ed[e] >= routeThreshold);
    const blockedKm = g.edges.reduce((s, e, i) => s + (ed[i] >= routeThreshold ? e.len : 0), 0) / 1000;
    return { base, scn, blockedKm, from: routeFrom, to: routeTo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, routeFrom, routeTo, routeThreshold, bucket, simRunKey]);
}
