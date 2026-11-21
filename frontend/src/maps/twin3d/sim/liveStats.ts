import type { Dataset } from "../../../scenarios/engine/types";
import type { SnapStats } from "./floodSolver";
import { FLOOD_DEPTH_M } from "./floodSolver";
import { buildGraph, edgeDepths, type Graph } from "../../../scenarios/engine/routing";

export interface LiveStats {
  t: number; rainMmH: number; cumRainMm: number;
  floodedHa: number; maxDepth: number; floodedBuildings: number;
  roadKmAffected: number; roadsAffected: number; facilitiesAffected: number;
  drainedM3: number; outfallM3: number; storedM3: number; rainM3: number;
}

let graphCache: { ds: Dataset; g: Graph } | null = null;
export function graphFor(ds: Dataset): Graph {
  if (!graphCache || graphCache.ds !== ds) graphCache = { ds, g: buildGraph(ds) };
  return graphCache.g;
}

export function computeLive(ds: Dataset, depth: Float32Array, stats: SnapStats | null, roadThreshold: number): LiveStats {
  const { nx, ny, cell_m } = ds.grid;
  let flooded = 0, maxD = 0;
  for (let i = 0; i < depth.length; i++) { const d = depth[i]; if (d >= FLOOD_DEPTH_M) flooded++; if (d > maxD) maxD = d; }
  let fb = 0;
  for (const b of ds.buildings) {
    const cx = b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length, cy = b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length;
    const ci = Math.floor(cx / cell_m), cj = Math.floor(cy / cell_m);
    let m = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < nx && j < ny) m = Math.max(m, depth[j * nx + i]);
    }
    if (m >= FLOOD_DEPTH_M) fb++;
  }
  const g = graphFor(ds);
  const ed = edgeDepths(g, depth, nx, ny, cell_m);
  let km = 0; const roads = new Set<string>();
  g.edges.forEach((e, i) => { if (ed[i] >= roadThreshold) { km += e.len / 1000; roads.add(e.roadId); } });
  let fa = 0;
  for (const f of ds.facilities) {
    const i = Math.min(nx - 1, Math.floor(f.x / cell_m)), j = Math.min(ny - 1, Math.floor(f.y / cell_m));
    let m = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < ny) m = Math.max(m, depth[b * nx + a]); }
    if (m >= FLOOD_DEPTH_M) fa++;
  }
  return {
    t: stats?.t ?? 0, rainMmH: stats?.rainMmH ?? 0, cumRainMm: stats?.cumRainMm ?? 0,
    floodedHa: (flooded * cell_m * cell_m) / 1e4, maxDepth: maxD, floodedBuildings: fb,
    roadKmAffected: km, roadsAffected: roads.size, facilitiesAffected: fa,
    drainedM3: stats?.drainM3 ?? 0, outfallM3: stats?.outfallM3 ?? 0, storedM3: stats?.storedM3 ?? 0, rainM3: stats?.rainM3 ?? 0,
  };
}
