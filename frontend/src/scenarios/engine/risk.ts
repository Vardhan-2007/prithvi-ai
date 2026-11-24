// Deterministic, explainable risk-index engine (see docs/methodology.md).
// Provisional (instant):  RiskIndex = 100 * (wT*T + wR*R + wD*D + wE*E)
// Final (after the flood simulation finishes): RiskIndex = 100 * (wT*T + wD*D + wE*E + wW*W), W = simulated water in the zone.
// Either way it is an INDEX, not a probability or depth.
// The Python twin lives in ai-engine/risk_scoring and is checked against this by tests.
import { drainFactor } from "../../maps/twin3d/sim/floodSolver";
import type { Band, Dataset, Scenario, ScenarioResult, ScoreStage, Zone, ZoneResult, Road, Facility } from "./types";

export type FactorKey = "terrain" | "rainfall" | "drainage" | "exposure" | "water";
export type Weights = Record<FactorKey, number>;
/** Provisional weights: the original formula, shown instantly while the simulation runs. */
export const WEIGHTS: Weights = { terrain: 0.30, rainfall: 0.25, drainage: 0.25, exposure: 0.20, water: 0 };
/** Final weights, once the simulated water W is known. Rain enters through W (it is uniform, so it cannot rank zones). ASSUMED. */
export const WEIGHTS_FINAL: Weights = { terrain: 0.20, rainfall: 0, drainage: 0.15, exposure: 0.20, water: 0.45 };
export const weightsFor = (stage: ScoreStage): Weights => (stage === "final" ? WEIGHTS_FINAL : WEIGHTS);
export const FACTOR_KEYS: FactorKey[] = ["terrain", "rainfall", "drainage", "exposure", "water"];

// Simulated-water factor W per zone, from the run's peak depths on the zone's open (non-building) cells:
//   W = 0.5 * min(1, share of cells reaching WATER_FLOOD_M / WATER_SHARE_REF) + 0.5 * min(1, 90th-percentile peak depth / WATER_DEPTH_REF_M)
export const WATER_FLOOD_M = 0.15;      // same "flooded" threshold as the solver statistics
export const WATER_SHARE_REF = 0.5;     // half the zone flooded -> full share term
export const WATER_DEPTH_REF_M = 0.5;   // 0.5 m at the 90th percentile -> full depth term
export const WATER_PERCENTILE = 0.9;
export const BAND_THRESHOLDS = { moderate: 35, higher: 48, highest: 60 } as const;
export const RAIN_DEPTH_REF_MM = 250;      // depth that maps to 1.0
export const RAIN_INTENSITY_REF_MMH = 100; // intensity that maps to 1.0
export const INLET_KERNEL_M = 90;
export const PUMP_COUNT = 6;

export const BASELINE: Scenario = {
  name: "Baseline reference", rainfallMm: 30, durationH: 6, blockageFrac: 0, overrides: {}, pumps: false,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function bandOf(index: number): Band {
  if (index >= BAND_THRESHOLDS.highest) return "highest";
  if (index >= BAND_THRESHOLDS.higher) return "higher";
  if (index >= BAND_THRESHOLDS.moderate) return "moderate";
  return "lower";
}

export function rainfallFactor(totalMm: number, durationH: number) {
  const intensity = totalMm / Math.max(0.25, durationH);
  const r = clamp01(0.5 * clamp01(totalMm / RAIN_DEPTH_REF_MM) + 0.5 * clamp01(intensity / RAIN_INTENSITY_REF_MMH));
  return { r, intensity };
}

// deterministic permutation so "x% blocked" always blocks the same inlets
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function inletOrder(n: number): number[] {
  const rnd = mulberry32(20261121);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export function resolveInletOpen(ds: Dataset, sc: Scenario): boolean[] {
  const n = ds.inlets.length;
  const order = inletOrder(n);
  const nBlocked = Math.round(clamp01(sc.blockageFrac) * n);
  const auto = new Set(order.slice(0, nBlocked));
  return ds.inlets.map((inl, i) => {
    const o = sc.overrides[inl.id];
    if (o === "cleared") return true;
    if (o === "blocked") return false;
    return !auto.has(i);
  });
}

export interface PumpSite { zoneId: string; x: number; y: number }

function zoneCapacity(z: Zone, ds: Dataset, open: boolean[], pumps: PumpSite[]): { cap: number; openN: number } {
  let s = 0, openN = 0;
  for (const [k, w] of z.inlets) if (open[k]) { s += w; openN++; }
  for (const p of pumps) {
    const d = Math.hypot(p.x - z.cx, p.y - z.cy);
    if (d <= 250) s += Math.exp(-d / INLET_KERNEL_M);
  }
  return { cap: clamp01(s / ds.zones.wref), openN };
}

/** linear-interpolated quantile of an ascending-sorted array (same as numpy.percentile's default) */
function quantileSorted(a: number[], q: number): number {
  if (a.length === 0) return 0;
  const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.min(a.length - 1, lo + 1);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

/** Simulated-water factor W (0..1) for every zone, from a grid of peak depths in metres (same layout as ds.grid). */
export function zoneWater(ds: Dataset, peak: ArrayLike<number>): number[] {
  const { nx, ny, cell_m, building_mask } = ds.grid, per = ds.zones.size_m / cell_m;
  return ds.zones.zones.map((z) => {
    const vals: number[] = [];
    for (let j = z.iy * per; j < Math.min(ny, (z.iy + 1) * per); j++)
      for (let i = z.ix * per; i < Math.min(nx, (z.ix + 1) * per); i++) {
        const c = j * nx + i;
        if (!building_mask[c]) vals.push(peak[c]);
      }
    if (vals.length === 0) return 0;
    let wet = 0; for (const v of vals) if (v >= WATER_FLOOD_M) wet++;
    vals.sort((a, b) => a - b);
    const share = wet / vals.length, pq = quantileSorted(vals, WATER_PERCENTILE);
    return clamp01(0.5 * Math.min(1, share / WATER_SHARE_REF) + 0.5 * Math.min(1, pq / WATER_DEPTH_REF_M));
  });
}

function compute(ds: Dataset, sc: Scenario, pumps: PumpSite[], water?: number[]): ScenarioResult {
  const { r, intensity } = rainfallFactor(sc.rainfallMm, sc.durationH);
  const seaF = drainFactor(sc.seaLevelM ?? 0);   // high tide / surge backs up the drains
  const open = resolveInletOpen(ds, sc);
  const stage: ScoreStage = water ? "final" : "provisional";
  const Wt = weightsFor(stage);
  const zones: ZoneResult[] = ds.zones.zones.map((z, k) => {
    const { cap: rawCap, openN } = zoneCapacity(z, ds, open, pumps);
    const cap = rawCap * seaF;
    const D = clamp01(0.6 * (1 - cap) + 0.4 * z.imperv);
    const W = water ? clamp01(water[k]) : 0;
    const contrib = {
      terrain: 100 * Wt.terrain * z.terrain,
      rainfall: 100 * Wt.rainfall * r,
      drainage: 100 * Wt.drainage * D,
      exposure: 100 * Wt.exposure * z.exposure,
      water: 100 * Wt.water * W,
    };
    const index = contrib.terrain + contrib.rainfall + contrib.drainage + contrib.exposure + contrib.water;
    return {
      id: z.id, index, band: bandOf(index),
      factors: { terrain: z.terrain, rainfall: r, drainage: D, exposure: z.exposure, water: W },
      contrib, drainCapacity: cap, openInlets: openN, totalInlets: z.inlets.length,
    };
  });
  const bandCounts: Record<Band, number> = { lower: 0, moderate: 0, higher: 0, highest: 0 };
  let sum = 0;
  for (const z of zones) { bandCounts[z.band]++; sum += z.index; }
  return { scenario: sc, stage, rainfallFactor: r, intensityMmH: intensity, zones, meanIndex: sum / zones.length, bandCounts, inletOpen: open };
}

/** Pump sites: top-index zones, >=150 m apart, chosen from the PROVISIONAL scenario without pumps. Pumps change the
 * simulated water, so siting them from the final (water-based) score would be circular. */
export function choosePumpSites(ds: Dataset, noPump: ScenarioResult): PumpSite[] {
  const byId = new Map(ds.zones.zones.map((z) => [z.id, z]));
  const ranked = [...noPump.zones].sort((a, b) => b.index * (0.6 + 0.4 * byId.get(b.id)!.exposure) - a.index * (0.6 + 0.4 * byId.get(a.id)!.exposure));
  const sites: PumpSite[] = [];
  for (const zr of ranked) {
    const z = byId.get(zr.id)!;
    if (sites.every((s) => Math.hypot(s.x - z.cx, s.y - z.cy) >= 150)) sites.push({ zoneId: z.id, x: z.cx, y: z.cy });
    if (sites.length >= PUMP_COUNT) break;
  }
  return sites;
}

/** Score a scenario. Without `opts.water` the result is PROVISIONAL (instant formula); with the per-zone simulated-water
 * factor from `zoneWater` (computed from that scenario's own flood run) it is FINAL. */
export function evaluate(ds: Dataset, sc: Scenario, opts?: { water?: number[] }): ScenarioResult & { pumpSites: PumpSite[] } {
  const water = opts?.water;
  if (water && water.length !== ds.zones.zones.length) throw new Error("water must have one value per zone");
  if (!sc.pumps) return { ...compute(ds, sc, [], water), pumpSites: [] };
  const base = compute(ds, { ...sc, pumps: false }, []);
  const sites = choosePumpSites(ds, base);
  return { ...compute(ds, sc, sites, water), pumpSites: sites };
}

export function delta(scn: ScenarioResult, base: ScenarioResult): number[] {
  return scn.zones.map((z, i) => z.index - base.zones[i].index);
}

// ---------------------------------------------------------------- exposure + priority
export interface ExposureSummary {
  flaggedZoneIds: string[];
  roads: { road: Road; lengthM: number }[];
  facilities: Facility[];
  roadKm: number;
}

export function isFlagged(z: ZoneResult) { return z.band === "higher" || z.band === "highest"; }

export function exposureSummary(ds: Dataset, res: ScenarioResult): ExposureSummary {
  const zs = ds.zones.size_m, nzx = ds.zones.nx;
  const flagged = new Set(res.zones.filter(isFlagged).map((z) => z.id));
  const zoneAt = (x: number, y: number) => {
    const ix = Math.floor(x / zs), iy = Math.floor(y / zs);
    return `zone_${String(iy * nzx + ix).padStart(3, "0")}`;
  };
  const roads: { road: Road; lengthM: number }[] = [];
  for (const road of ds.roads) {
    let len = 0;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [x0, y0] = road.pts[i], [x1, y1] = road.pts[i + 1];
      if (flagged.has(zoneAt((x0 + x1) / 2, (y0 + y1) / 2))) len += Math.hypot(x1 - x0, y1 - y0);
    }
    if (len > 0) roads.push({ road, lengthM: len });
  }
  roads.sort((a, b) => b.lengthM - a.lengthM);
  const facilities = ds.facilities.filter((f) => flagged.has(zoneAt(f.x, f.y)));
  return { flaggedZoneIds: [...flagged], roads, facilities, roadKm: roads.reduce((s, r) => s + r.lengthM, 0) / 1000 };
}

export interface PriorityItem {
  zone: Zone; result: ZoneResult; priority: number; topFactor: FactorKey; facilities: number;
}

/** Inspection-priority aid: index weighted by exposure. Not an evacuation or dispatch instruction. */
export function rankPriority(ds: Dataset, res: ScenarioResult, n = 10): PriorityItem[] {
  const byId = new Map(ds.zones.zones.map((z) => [z.id, z]));
  const items = res.zones.map((r) => {
    const zone = byId.get(r.id)!;
    const f = zone.facilities.health + zone.facilities.emergency + zone.facilities.shelter;
    const priority = r.index * (0.6 + 0.4 * zone.exposure) + 4 * Math.min(f, 2);
    // "driver" = factor with the greatest weighted contribution after removing the uniform rainfall term
    const topFactor = FACTOR_KEYS.filter((k) => k !== "rainfall").sort((a, b) => r.contrib[b] - r.contrib[a])[0];
    return { zone, result: r, priority, topFactor, facilities: f };
  });
  return items.sort((a, b) => b.priority - a.priority).slice(0, n);
}

export const BAND_COLORS: Record<Band, string> = {
  lower: "#2dd4bf", moderate: "#facc15", higher: "#fb923c", highest: "#ef4444",
};

/** Continuous colour ramp for index 0..100 (teal -> yellow -> orange -> red). */
export function indexColor(v: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [0.07, 0.35, 0.45]], [35, [0.18, 0.78, 0.7]], [48, [0.98, 0.8, 0.08]],
    [60, [0.98, 0.45, 0.13]], [80, [0.94, 0.15, 0.15]], [100, [0.6, 0.05, 0.2]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (v <= b) {
      const t = clamp01((v - a) / (b - a));
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}
