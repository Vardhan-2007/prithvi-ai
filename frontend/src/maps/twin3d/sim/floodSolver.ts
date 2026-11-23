// Simplified 2-D "virtual pipe" shallow-water solver (after Mei, Decaudin & Hu 2007) on the pilot grid.
// It is an UNCALIBRATED, illustrative scenario model: no surveyed drainage, no real event calibration,
// 12.5 m cells, constant Manning-like damping. Output is "scenario water depth", not a forecast.
import { stormCumulativeMm, stormDurationH, stormRateMmH, triangleStorm, type Storm } from "./storm";
export { PEAK_FRACTION } from "./storm";
export type { Storm } from "./storm";

export const G = 9.81;
export const ROAD_LOWERING_M = 0.15;      // assumed kerb/channel effect, applied to road cells
export const RUNOFF_IMPERVIOUS = 0.9;     // roofs + roads
export const RUNOFF_PERVIOUS = 0.55;      // assumed for clayey coastal soils (no soil data used)
export const INLET_CAPACITY_M3S = 0.25;    // assumed capacity of one proxy storm-drain inlet
export const PUMP_CAPACITY_M3S = 0.15;
export const OUTFALL_CREST_M = 0.30;      // assumed tail-water / bund height at the downstream edge
export const OUTFALL_CW = 0.5;            // broad-crested weir coefficient
export const FLOOD_DEPTH_M = 0.15;        // "flooded" threshold used for statistics (assumption)
// After the rain stops, remaining standing water recedes exponentially with this time constant. It stands for everything the
// 12.5 m grid cannot resolve: water trapped behind building footprints leaking out through gaps and gutters, infiltration,
// evaporation and informal pumping. Without it, pockets walled in by buildings would hold water for ever. ASSUMED, not calibrated.
export const RECESSION_TAU_H = 1.0;
export const DT = 2;                      // seconds per solver step
export const SNAP_S = 120;                // snapshot interval (simulated seconds)

export interface SolverInit {
  nx: number; ny: number; cell: number;
  dem: Float32Array;                      // metres
  obstacle: Uint8Array;                   // 1 = building (impassable for water)
  road: Uint8Array;
  inlets: { cell: number; open: boolean }[];
  pumps: { cell: number }[];
  storm: Storm;                           // rain input: triangle (what-if) or step hyetograph (forecast / replay)
  tailH: number;                          // hours simulated after the rain ends
}

export interface SnapStats {
  t: number; rainM3: number; drainM3: number; outfallM3: number; storedM3: number;
  floodedCells: number; maxDepth: number; rainMmH: number; cumRainMm: number;
}

/** Symmetric triangular hyetograph (what-if presets): rises to a peak at the midpoint, then falls; integrates to `totalMm`. mm/h */
export function rainRateMmH(tSeconds: number, totalMm: number, durationH: number): number {
  return stormRateMmH(triangleStorm(totalMm, durationH), tSeconds);
}
export function cumulativeRainMm(tSeconds: number, totalMm: number, durationH: number): number {
  return stormCumulativeMm(triangleStorm(totalMm, durationH), tSeconds);
}
export class FloodSolver {
  readonly nx: number; readonly ny: number; readonly n: number; readonly cell: number;
  readonly init: SolverInit;
  h: Float32Array; peak: Float32Array;
  private hn: Float32Array;
  private f: [Float32Array, Float32Array, Float32Array, Float32Array]; // outflow to L, R, S(down), N(up)
  private z: Float32Array;
  private rainW: Float32Array;
  private wall: Uint8Array;
  private outfall: number[] = [];
  private inletCells: Int32Array; private inletOpen: Uint8Array;
  private pumpCells: Int32Array;
  t = 0;
  rainM3 = 0; drainM3 = 0; outfallM3 = 0;
  private readonly A: number; private readonly pipeA: number; private readonly damp = 0.93;

  constructor(init: SolverInit) {
    this.init = init;
    const { nx, ny, cell } = init;
    this.nx = nx; this.ny = ny; this.n = nx * ny; this.cell = cell;
    this.A = cell * cell; this.pipeA = 0.4 * cell;
    const n = this.n;
    this.h = new Float32Array(n); this.hn = new Float32Array(n); this.peak = new Float32Array(n);
    this.f = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    this.z = new Float32Array(n); this.wall = init.obstacle;
    for (let i = 0; i < n; i++) this.z[i] = init.dem[i] - (init.road[i] ? ROAD_LOWERING_M : 0);

    // rain weights: runoff coefficient; roof rain is delivered to the nearest non-building cell
    this.rainW = new Float32Array(n);
    const target = new Int32Array(n).fill(-1);
    const q: number[] = [];
    for (let i = 0; i < n; i++) if (!this.wall[i]) { target[i] = i; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % nx, y = (i / nx) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < nx - 1 ? i + 1 : -1, y > 0 ? i - nx : -1, y < ny - 1 ? i + nx : -1];
      for (const j of nb) if (j >= 0 && target[j] < 0) { target[j] = target[i]; q.push(j); }
    }
    for (let i = 0; i < n; i++) {
      const c = this.wall[i] || init.road[i] ? RUNOFF_IMPERVIOUS : RUNOFF_PERVIOUS;
      const tgt = target[i] >= 0 ? target[i] : i;
      this.rainW[tgt] += c;
    }

    // downstream (outfall) edge = edge with the lowest mean ground level
    const edge = (cells: number[]) => cells.reduce((s, i) => s + init.dem[i], 0) / cells.length;
    const W: number[] = [], Ee: number[] = [], S: number[] = [], Nn: number[] = [];
    for (let y = 0; y < ny; y++) { W.push(y * nx); Ee.push(y * nx + nx - 1); }
    for (let x = 0; x < nx; x++) { S.push(x); Nn.push((ny - 1) * nx + x); }
    const edges = [W, Ee, S, Nn];
    const lowest = edges.reduce((best, e) => (edge(e) < edge(best) ? e : best), edges[0]);
    this.outfall = lowest.filter((i) => !this.wall[i]);

    this.inletCells = Int32Array.from(init.inlets.map((i) => i.cell));
    this.inletOpen = Uint8Array.from(init.inlets.map((i) => (i.open ? 1 : 0)));
    this.pumpCells = Int32Array.from(init.pumps.map((p) => p.cell));
  }

  get rainSeconds() { return stormDurationH(this.init.storm) * 3600; }
  get totalSeconds() { return this.rainSeconds + this.init.tailH * 3600; }

  step(dt = DT) {
    const { nx, ny, n, A, pipeA, damp } = this;
    const h = this.h, z = this.z, wall = this.wall, hn = this.hn;
    const [fL, fR, fS, fN] = this.f;

    // 1) rain
    const rateMs = stormRateMmH(this.init.storm, this.t) / 1000 / 3600;
    if (rateMs > 0) {
      const add = rateMs * dt;
      for (let i = 0; i < n; i++) { const w = this.rainW[i]; if (w > 0) h[i] += add * w; }
      this.rainM3 += add * A * n * 0.7; // approx accounting (mean runoff ~0.7); exact balance is tracked below
    }

    // 1b) recession once the rain has stopped (counted as drained volume, so the mass balance still closes)
    if (this.t >= this.rainSeconds) {
      const frac = 1 - Math.exp(-dt / (RECESSION_TAU_H * 3600));
      for (let i = 0; i < n; i++) { const d = h[i]; if (d > 0) { const v = d * frac; h[i] = d - v; this.drainM3 += v * A; } }
    }

    // 2) sinks
    for (let k = 0; k < this.inletCells.length; k++) {
      if (!this.inletOpen[k]) continue;
      const i = this.inletCells[k], d = h[i];
      if (d <= 0) continue;
      const cap = INLET_CAPACITY_M3S * Math.min(1, d / 0.03) * dt;
      const vol = Math.min(d * A, cap);
      h[i] -= vol / A; this.drainM3 += vol;
    }
    for (let k = 0; k < this.pumpCells.length; k++) {
      const i = this.pumpCells[k], d = h[i];
      if (d <= 0) continue;
      const vol = Math.min(d * A, PUMP_CAPACITY_M3S * dt);
      h[i] -= vol / A; this.drainM3 += vol;
    }
    for (const i of this.outfall) {
      const d = h[i] - OUTFALL_CREST_M;
      if (d > 0) {
        const vol = Math.min(d * A, OUTFALL_CW * this.cell * Math.pow(d, 1.5) * dt);
        h[i] -= vol / A; this.outfallM3 += vol;
      }
    }

    // 3) flux update (virtual pipes)
    const k = (dt * pipeA * G) / this.cell;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        if (wall[i] || h[i] < 1e-5) { fL[i] = fR[i] = fS[i] = fN[i] = 0; continue; }
        const H = z[i] + h[i];
        let l = 0, r = 0, s = 0, u = 0;
        if (x > 0 && !wall[i - 1]) l = Math.max(0, fL[i] * damp + k * (H - z[i - 1] - h[i - 1]));
        if (x < nx - 1 && !wall[i + 1]) r = Math.max(0, fR[i] * damp + k * (H - z[i + 1] - h[i + 1]));
        if (y > 0 && !wall[i - nx]) s = Math.max(0, fS[i] * damp + k * (H - z[i - nx] - h[i - nx]));
        if (y < ny - 1 && !wall[i + nx]) u = Math.max(0, fN[i] * damp + k * (H - z[i + nx] - h[i + nx]));
        const sum = l + r + s + u;
        if (sum * dt > h[i] * A) { const K = (h[i] * A) / (sum * dt); l *= K; r *= K; s *= K; u *= K; }
        fL[i] = l; fR[i] = r; fS[i] = s; fN[i] = u;
      }
    }
    // 4) depth update
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        if (wall[i]) { hn[i] = 0; continue; }
        const out = fL[i] + fR[i] + fS[i] + fN[i];
        let inn = 0;
        if (x > 0) inn += fR[i - 1];
        if (x < nx - 1) inn += fL[i + 1];
        if (y > 0) inn += fN[i - nx];
        if (y < ny - 1) inn += fS[i + nx];
        const v = h[i] + (dt * (inn - out)) / A;
        hn[i] = v > 0 ? v : 0;
      }
    }
    this.h = hn; this.hn = h;
    for (let i = 0; i < n; i++) if (this.h[i] > this.peak[i]) this.peak[i] = this.h[i];
    this.t += dt;
  }

  /** advance one snapshot interval */
  advanceSnapshot() {
    const steps = Math.round(SNAP_S / DT);
    for (let s = 0; s < steps; s++) this.step(DT);
  }

  stats(): SnapStats {
    let stored = 0, flooded = 0, maxD = 0;
    for (let i = 0; i < this.n; i++) {
      const d = this.h[i];
      stored += d * this.A;
      if (d >= FLOOD_DEPTH_M) flooded++;
      if (d > maxD) maxD = d;
    }
    const storm = this.init.storm;
    return {
      t: this.t, rainM3: this.rainM3, drainM3: this.drainM3, outfallM3: this.outfallM3, storedM3: stored,
      floodedCells: flooded, maxDepth: maxD,
      rainMmH: stormRateMmH(storm, this.t), cumRainMm: stormCumulativeMm(storm, this.t),
    };
  }

  /** exact rain mass balance: sum over cells of rainW * rain depth * area */
  expectedRainM3(): number {
    let w = 0; for (let i = 0; i < this.n; i++) w += this.rainW[i];
    return (stormCumulativeMm(this.init.storm, this.t) / 1000) * w * this.A;
  }
}

export function buildSolverInit(
  ds: { grid: { nx: number; ny: number; cell_m: number; dem: number[]; building_mask: number[]; road_mask: number[] }; inlets: { ix: number; iy: number }[] },
  open: boolean[], pumpCells: number[], rain: number | Storm, durationH = 0, tailH = 3,
): SolverInit {
  // `rain` is either a Storm, or a total depth (mm) that is turned into the classic triangle storm over `durationH`.
  const storm: Storm = typeof rain === "number" ? triangleStorm(rain, durationH) : rain;
  const { nx, ny, cell_m } = ds.grid;
  return {
    nx, ny, cell: cell_m,
    dem: Float32Array.from(ds.grid.dem), obstacle: Uint8Array.from(ds.grid.building_mask), road: Uint8Array.from(ds.grid.road_mask),
    inlets: ds.inlets.map((inl, i) => ({ cell: inl.iy * nx + inl.ix, open: open[i] })),
    pumps: pumpCells.map((cell) => ({ cell })), storm, tailH,
  };
}
