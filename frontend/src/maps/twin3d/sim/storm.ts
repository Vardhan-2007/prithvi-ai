// Rain input for the flood solver. A storm is either the original symmetric triangle (what-if presets) or a
// step hyetograph: rain depth per fixed time step, e.g. an hourly forecast or a replayed past storm.
// Rain inside one step falls at a constant rate. Mirrors backend/simulation/storm.py.

export type TriangleStorm = { kind: "triangle"; totalMm: number; durationH: number };
export type StepStorm = {
  kind: "steps";
  stepH: number;      // length of one step in hours (1 = hourly)
  mm: number[];       // rain depth in each step, mm
  startIso?: string;  // wall-clock start of step 0 (for labelling forecasts / replays)
  label?: string;     // e.g. "Open-Meteo ensemble median"
};
export type Storm = TriangleStorm | StepStorm;

/** Peak position of the triangle as a fraction of its duration (symmetric). */
export const PEAK_FRACTION = 0.5;
/** Validation limits shared with the backend. */
export const MAX_STEPS = 168;
export const MAX_STEP_MM = 300;

export const triangleStorm = (totalMm: number, durationH: number): TriangleStorm => ({ kind: "triangle", totalMm, durationH });

export function stepStorm(mm: number[], stepH = 1, extra?: { startIso?: string; label?: string }): StepStorm {
  if (!(stepH > 0)) throw new Error("stepH must be > 0");
  if (mm.length === 0 || mm.length > MAX_STEPS) throw new Error(`a hyetograph needs 1..${MAX_STEPS} steps`);
  for (const v of mm) if (!(v >= 0 && v <= MAX_STEP_MM) || !Number.isFinite(v)) throw new Error(`each step must be 0..${MAX_STEP_MM} mm`);
  return { kind: "steps", stepH, mm: [...mm], ...extra };
}

export function stormDurationH(s: Storm): number {
  return s.kind === "triangle" ? s.durationH : s.mm.length * s.stepH;
}

export function stormTotalMm(s: Storm): number {
  return s.kind === "triangle" ? s.totalMm : s.mm.reduce((a, b) => a + b, 0);
}

/** Peak hourly intensity, mm/h (used by the risk index's rainfall factor). */
export function stormPeakMmH(s: Storm): number {
  if (s.kind === "triangle") return (2 * s.totalMm) / s.durationH;
  return Math.max(0, ...s.mm) / s.stepH;
}

/** Rain rate at time t (seconds from the start), mm/h. */
export function stormRateMmH(s: Storm, tSeconds: number): number {
  if (s.kind === "triangle") {
    const D = s.durationH * 3600, tp = PEAK_FRACTION * D;
    if (tSeconds < 0 || tSeconds >= D) return 0;
    const peak = (2 * s.totalMm) / s.durationH;
    return tSeconds < tp ? peak * (tSeconds / tp) : peak * (1 - (tSeconds - tp) / (D - tp));
  }
  if (tSeconds < 0) return 0;
  const k = Math.floor(tSeconds / (s.stepH * 3600));
  return k < s.mm.length ? s.mm[k] / s.stepH : 0;
}

/** Rain that has fallen from the start up to time t (seconds), mm. */
export function stormCumulativeMm(s: Storm, tSeconds: number): number {
  if (s.kind === "triangle") {
    const D = s.durationH * 3600, tp = PEAK_FRACTION * D;
    const t = Math.min(Math.max(tSeconds, 0), D);
    const peak = (2 * s.totalMm) / s.durationH / 3600; // mm/s
    if (t <= tp) return (0.5 * peak * (t * t)) / tp;
    return 0.5 * peak * tp + peak * (t - tp) - (0.5 * peak * (t - tp) ** 2) / (D - tp);
  }
  const stepS = s.stepH * 3600;
  const t = Math.max(0, tSeconds);
  const k = Math.floor(t / stepS);
  let sum = 0;
  for (let i = 0; i < Math.min(k, s.mm.length); i++) sum += s.mm[i];
  if (k < s.mm.length) sum += s.mm[k] * ((t - k * stepS) / stepS);
  return sum;
}

/** Hourly bars for display (mm in each hour of the storm). */
export function stormHourlyBars(s: Storm): number[] {
  const hours = Math.max(1, Math.ceil(stormDurationH(s) - 1e-9));
  const out: number[] = [];
  for (let h = 0; h < hours; h++) out.push(stormCumulativeMm(s, (h + 1) * 3600) - stormCumulativeMm(s, h * 3600));
  return out;
}
