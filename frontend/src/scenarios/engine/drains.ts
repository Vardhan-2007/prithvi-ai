// "Which drains are most likely to block, and which matter most if they do?"  An INDICATIVE ranking, not a prediction.
//
// There is no drain inventory, inspection record or blockage history for the pilot area (the 56 inlets are proxy points),
// so real blockages cannot be predicted. This module ranks the proxy inlets with transparent, ASSUMED factors:
//
//   susceptibility S = 0.40 * lowLying + 0.30 * builtUp + 0.30 * spacing     (each factor min-max scaled over the 56 inlets, 0..1)
//     lowLying : sits low, and lower than its surroundings, where water, silt and litter collect       (terrain)
//     builtUp  : much paving and roofs within 75 m, so a heavy load of runoff and litter                (OSM masks)
//     spacing  : far from the neighbouring drains, so each drain serves a larger area                    (inlet layout)
//   impact K  : what happens to the zone scores if THIS drain is blocked, in the current scenario        (risk engine)
//   inspect-first score = S * (K / max K)
//
// S is a relative ranking among these 56 points. It is not a probability and is not validated against real blockages.
import type { Dataset, Scenario } from "./types";
import { evaluate } from "./risk";

export type Level = "high" | "medium" | "low";
export const W_LOW = 0.4, W_BUILT = 0.3, W_SPACE = 0.3;
export const BUILT_RADIUS_M = 75, SURROUND_RADIUS_M = 60;

export interface DrainStatic {
  id: string; index: number; x: number; y: number;
  factors: { lowLying: number; builtUp: number; spacing: number };
  susceptibility: number; level: Level;
}
export interface DrainInfo extends DrainStatic {
  open: boolean;                       // state in the current scenario
  impact: { meanRise: number; maxZoneRise: number; zoneId: string; newlyFlagged: number };
  inspectScore: number;                // S * normalised impact
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const minmax = (a: number[]) => { const lo = Math.min(...a), hi = Math.max(...a); return a.map((v) => (hi - lo < 1e-9 ? 0 : (v - lo) / (hi - lo))); };
export const levelOf = (s: number): Level => (s >= 0.5 ? "high" : s >= 0.3 ? "medium" : "low");

const cache = new WeakMap<Dataset, DrainStatic[]>();

/** Scenario-independent part: depends only on the dataset. */
export function drainStatics(ds: Dataset): DrainStatic[] {
  const hit = cache.get(ds); if (hit) return hit;
  const { nx, ny, cell_m, dem, building_mask, road_mask } = ds.grid;
  const rs = Math.round(SURROUND_RADIUS_M / cell_m), rb = Math.round(BUILT_RADIUS_M / cell_m);
  const lowRaw: number[] = [], builtRaw: number[] = [], spaceRaw: number[] = [];
  ds.inlets.forEach((inl, k) => {
    const ci = Math.min(nx - 1, Math.max(0, inl.ix)), cj = Math.min(ny - 1, Math.max(0, inl.iy));
    const own = dem[cj * nx + ci];
    let sum = 0, n = 0, paved = 0, m = 0;
    for (let dj = -rb; dj <= rb; dj++) for (let di = -rb; di <= rb; di++) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const d = Math.hypot(di, dj); if (d > rb) continue;
      const idx = j * nx + i;
      m++; if (building_mask[idx] || road_mask[idx]) paved++;
      if (d <= rs && d > 0) { sum += dem[idx]; n++; }
    }
    const surround = n ? sum / n : own;
    lowRaw.push(0.6 * -own + 0.4 * (surround - own));
    builtRaw.push(m ? paved / m : 0);
    const dists = ds.inlets.filter((_, q) => q !== k).map((o) => Math.hypot(o.x - inl.x, o.y - inl.y)).sort((a, b) => a - b).slice(0, 3);
    spaceRaw.push(dists.reduce((a, b) => a + b, 0) / Math.max(1, dists.length));
  });
  const L = minmax(lowRaw), B = minmax(builtRaw), S = minmax(spaceRaw);
  const out = ds.inlets.map((inl, k): DrainStatic => {
    const s = clamp01(W_LOW * L[k] + W_BUILT * B[k] + W_SPACE * S[k]);
    return { id: inl.id, index: k, x: inl.x, y: inl.y, factors: { lowLying: L[k], builtUp: B[k], spacing: S[k] }, susceptibility: s, level: levelOf(s) };
  });
  cache.set(ds, out); return out;
}

const flaggedCount = (r: ReturnType<typeof evaluate>) => r.zones.filter((z) => z.band === "higher" || z.band === "highest").length;

/** Full list for the current scenario: static susceptibility plus what a blockage at each drain would do right now. */
export function drainWatchList(ds: Dataset, sc: Scenario, current?: { inletOpen: boolean[] }): DrainInfo[] {
  const statics = drainStatics(ds);
  const open = current?.inletOpen ?? evaluate(ds, sc).inletOpen;
  const raw = statics.map((s) => {
    const withOverride = (state: "blocked" | "cleared") => evaluate(ds, { ...sc, overrides: { ...sc.overrides, [s.id]: state } });
    const blocked = withOverride("blocked"), cleared = withOverride("cleared");
    let maxRise = 0, zi = 0;
    blocked.zones.forEach((z, i) => { const d = z.index - cleared.zones[i].index; if (d > maxRise) { maxRise = d; zi = i; } });
    return { s, meanRise: blocked.meanIndex - cleared.meanIndex, maxZoneRise: maxRise, zoneId: ds.zones.zones[zi]?.id ?? "", newlyFlagged: flaggedCount(blocked) - flaggedCount(cleared) };
  });
  const maxK = Math.max(1e-9, ...raw.map((r) => r.meanRise));
  return raw.map((r, k): DrainInfo => ({
    ...r.s, open: open[k],
    impact: { meanRise: r.meanRise, maxZoneRise: r.maxZoneRise, zoneId: r.zoneId, newlyFlagged: r.newlyFlagged },
    inspectScore: r.s.susceptibility * (r.meanRise / maxK),
  }));
}

/** The k drains an "assume the likeliest ones block" scenario would use (most susceptible first). */
export function likeliestBlocked(ds: Dataset, k: number): string[] {
  return [...drainStatics(ds)].sort((a, b) => b.susceptibility - a.susceptibility).slice(0, Math.max(0, k)).map((d) => d.id);
}
