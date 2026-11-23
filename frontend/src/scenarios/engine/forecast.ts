// Live mode: hour-by-hour rain forecast for the pilot (Open-Meteo Ensemble API, ECMWF IFS 0.25° ensemble), reduced to
// three storms - low / likely / high = the real ensemble members at the 10th / 50th / 90th percentile of total rain.
// A FORECAST-DRIVEN SCENARIO, not an official forecast or warning. Mirrors backend/services/forecast.py.
import { api } from "../../components/api/client";
import type { LayerMeta } from "./types";

export const ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble";
export const MODEL = "ecmwf_ifs025_ensemble";
export const MODEL_LABEL = "ECMWF IFS 0.25° ensemble via Open-Meteo";
export const ALLOWED_HOURS = [24, 48, 72] as const;
export type ForecastHours = (typeof ALLOWED_HOURS)[number];
export const CACHE_TTL_MS = 3600_000;
export type CaseKey = "low" | "likely" | "high";
export const CASE_PERCENTILES: Record<CaseKey, number> = { low: 0.1, likely: 0.5, high: 0.9 };

export interface ForecastCase { hyetograph_mm: number[]; total_mm: number; peak_mm_h: number; member_rank: number }
export interface ForecastSummary {
  status: "forecast_driven_scenario";
  statement: string;
  source: { name: string; url: string; model: string; licence: string; grid: string };
  start_utc: string;          // "YYYY-MM-DDTHH:00" (GMT)
  step_hours: 1;
  hours: number;
  members: number;
  range_mm: { min: number; max: number };
  cases: Record<CaseKey, ForecastCase>;
  fetched_at_utc: string;
}
export type ForecastOrigin = "api" | "direct" | "cache";
export interface ForecastResult { data: ForecastSummary; origin: ForecastOrigin; stale: boolean }

const MEMBER_KEY = /^precipitation(?:_member(\d+))?(?:_[a-z0-9_]+)?$/;
const r2 = (v: number) => Math.round(v * 100) / 100, r1 = (v: number) => Math.round(v * 10) / 10;

export class ForecastUnavailable extends Error {}

/** times + one hourly precipitation series per ensemble member (control `precipitation`, then `precipitation_memberNN`). */
export function parseMembers(payload: unknown): { times: string[]; members: number[][] } {
  const hourly = (payload as { hourly?: Record<string, unknown> })?.hourly ?? {};
  const times = hourly.time;
  if (!Array.isArray(times) || times.length === 0) throw new ForecastUnavailable("forecast response has no hourly time axis");
  const found: [number, number[]][] = [];
  for (const [key, series] of Object.entries(hourly)) {
    const m = MEMBER_KEY.exec(key);
    if (!m || !Array.isArray(series) || series.length !== times.length) continue;
    found.push([Number(m[1] ?? 0), series.map((v) => (v === null || !Number.isFinite(Number(v)) ? Number.NaN : Math.max(0, Number(v))))]);
  }
  if (found.length === 0) throw new ForecastUnavailable("forecast response has no precipitation members");
  found.sort((a, b) => a[0] - b[0]);
  return { times: times as string[], members: found.map((f) => f[1]) };
}

/** Slice `hours` steps from the current GMT hour; members with gaps in the window are dropped. */
export function windowFrom(times: string[], members: number[][], now: Date, hours: number): { start: string; win: number[][] } {
  const stamp = now.toISOString().slice(0, 13) + ":00";
  const start = times.findIndex((t) => t >= stamp);
  if (start < 0 || start + hours > times.length) throw new ForecastUnavailable(`forecast does not cover the next ${hours} h`);
  const win = members.map((m) => m.slice(start, start + hours)).filter((m) => m.every((v) => !Number.isNaN(v)));
  if (win.length === 0) throw new ForecastUnavailable("every ensemble member has gaps in the forecast window");
  return { start: times[start], win };
}

const total = (m: number[]) => m.reduce((a, b) => a + b, 0);

/** Low / likely / high = whole ensemble members at the 10th / 50th / 90th percentile of total rain (nearest rank). */
export function pickCases(members: number[][]): Record<CaseKey, ForecastCase> {
  const order = members.map((m, i) => [total(m), i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((p) => p[1]);
  const n = order.length;
  const out = {} as Record<CaseKey, ForecastCase>;
  for (const [name, q] of Object.entries(CASE_PERCENTILES) as [CaseKey, number][]) {
    const k = Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1));
    const m = members[order[k]];
    out[name] = { hyetograph_mm: m.map(r2), total_mm: r1(total(m)), peak_mm_h: r1(Math.max(...m)), member_rank: k + 1 };
  }
  return out;
}

export function summarise(payload: unknown, now: Date, hours: number): ForecastSummary {
  const { times, members } = parseMembers(payload);
  const { start, win } = windowFrom(times, members, now, hours);
  const totals = win.map(total).sort((a, b) => a - b);
  return {
    status: "forecast_driven_scenario",
    statement: "Forecast-driven scenario for planning. Not an official forecast or warning: follow IMD and the district administration.",
    source: {
      name: MODEL_LABEL, url: "https://open-meteo.com/en/docs/ensemble-api", model: MODEL,
      licence: "Open-Meteo free API: non-commercial use, attribution required (CC BY 4.0 data)",
      grid: "~25 km; the whole pilot area is inside one grid cell, so rain is uniform across it",
    },
    start_utc: start, step_hours: 1, hours, members: win.length,
    range_mm: { min: r1(totals[0]), max: r1(totals[totals.length - 1]) },
    cases: pickCases(win),
    fetched_at_utc: now.toISOString().slice(0, 19) + "Z",
  };
}

export function ensembleUrl(lat: number, lon: number, hours: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: "precipitation", models: MODEL,
    forecast_days: String(Math.min(16, Math.ceil(hours / 24) + 1)), timezone: "GMT",
  });
  return `${ENSEMBLE_URL}?${q}`;
}

// ---- cache (per browser, best effort: storage can be unavailable) ----
const cacheKey = (hours: number) => `prithvi.forecast.${hours}`;
function readCache(hours: number): ForecastSummary | null {
  try { const s = localStorage.getItem(cacheKey(hours)); return s ? (JSON.parse(s) as ForecastSummary) : null; } catch { return null; }
}
function writeCache(d: ForecastSummary) {
  try { localStorage.setItem(cacheKey(d.hours), JSON.stringify(d)); } catch { /* storage unavailable: fine */ }
}
export const ageMs = (d: ForecastSummary, now = Date.now()) => now - Date.parse(d.fetched_at_utc);

/** Backend first (it caches for everyone), then Open-Meteo directly from the browser, then a cached copy (marked stale
 * if older than an hour). Throws ForecastUnavailable if nothing works. */
export async function getForecast(lat: number, lon: number, hours: ForecastHours, deps = {
  viaApi: (h: number) => api.forecast(h) as Promise<ForecastSummary>,
  direct: async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<unknown>; },
  now: () => new Date(),
}): Promise<ForecastResult> {
  const fresh = readCache(hours);
  if (fresh && ageMs(fresh, deps.now().getTime()) < CACHE_TTL_MS) return { data: fresh, origin: "cache", stale: false };
  try {
    const d = await deps.viaApi(hours);
    if (d?.cases?.likely) { writeCache(d); return { data: d, origin: "api", stale: false }; }
  } catch { /* backend asleep / not configured: try Open-Meteo directly */ }
  try {
    const d = summarise(await deps.direct(ensembleUrl(lat, lon, hours)), deps.now(), hours);
    writeCache(d);
    return { data: d, origin: "direct", stale: false };
  } catch (e) {
    if (fresh) return { data: fresh, origin: "cache", stale: true };
    throw e instanceof ForecastUnavailable ? e : new ForecastUnavailable("could not reach the forecast service");
  }
}

/** Provenance card for the Data & limits tab while Live mode is on. */
export function forecastLayer(d: ForecastSummary): LayerMeta {
  return {
    id: "live_forecast", title: "Live rain forecast (Live mode)", source_name: d.source.name, source_url: d.source.url,
    retrieved_at: d.fetched_at_utc, licence_or_terms: d.source.licence, native_resolution_or_scale: `${d.source.grid}; hourly`,
    processing_method: `Next ${d.hours} h of hourly precipitation for the pilot centre from ${d.members} ensemble members. Low / likely / high = the members at the 10th / 50th / 90th percentile of total rain, used as step hyetographs for the flood solver.`,
    data_status: "simulated",
    known_limitations: "Model forecast, not an observation or an official warning. One grid cell covers the whole pilot, so rain is uniform; thunderstorm timing and location are uncertain.",
  };
}
