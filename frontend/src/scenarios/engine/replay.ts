// Storm replay + honest validation. Mirrors backend/services/replay.py for the rain; the scoring against observed
// waterlogging reports lives here (the app is where the final, water-based score exists).
import { api } from "../../components/api/client";
import type { Dataset, ScenarioResult } from "./types";

export const PREVIOUS_RUNS_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast";
export const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
export const FORECAST_VAR = "precipitation_previous_day1";
export const TZ = "Asia/Kolkata";
export const FORECAST_ARCHIVE_START = "2024-01-01";
export const ARCHIVE_DELAY_DAYS = 5;
/** A report counts as a HIT if a zone flagged Higher/Highest (final score) has its centre within this distance. */
export const HIT_RADIUS_M = 150;

export type ReplaySeriesKey = "forecast_day_ahead" | "actual";
export interface ReplayRain {
  date: string; timezone: string; step_hours: 1; statement: string;
  series: Partial<Record<ReplaySeriesKey, number[]>>;
  totals_mm: Partial<Record<ReplaySeriesKey, number>>;
  notes: string[];
}
export class ReplayUnavailable extends Error {}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

export function checkDate(day: string, today: string): Record<ReplaySeriesKey, boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day + "T00:00:00Z"))) throw new Error("date must be YYYY-MM-DD");
  if (day >= today) throw new Error("replay needs a past date");
  return { forecast_day_ahead: day >= FORECAST_ARCHIVE_START, actual: day <= addDays(today, -ARCHIVE_DELAY_DAYS) };
}

export function seriesFor(payload: unknown, key: string, day: string): number[] {
  const h = (payload as { hourly?: Record<string, unknown> })?.hourly ?? {};
  const times = h.time, vals = h[key];
  if (!Array.isArray(times) || !Array.isArray(vals) || times.length !== vals.length) throw new ReplayUnavailable(`response has no hourly '${key}'`);
  const out = vals.filter((_, i) => typeof times[i] === "string" && (times[i] as string).startsWith(day));
  if (out.length !== 24) throw new ReplayUnavailable(`expected 24 hours for ${day}, got ${out.length}`);
  if (out.some((v) => v === null || !Number.isFinite(Number(v)))) throw new ReplayUnavailable(`'${key}' has gaps on ${day}`);
  return out.map((v) => Math.round(Math.max(0, Number(v)) * 100) / 100);
}

const url = (base: string, lat: number, lon: number, day: string, v: string) =>
  `${base}?${new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: v, start_date: day, end_date: day, timezone: TZ })}`;

/** Backend first, then Open-Meteo directly from the browser. */
export async function getReplay(lat: number, lon: number, day: string, deps = {
  viaApi: (d: string) => api.replay(d) as Promise<ReplayRain>,
  direct: async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<unknown>; },
  today: () => new Date().toISOString().slice(0, 10),
}): Promise<ReplayRain> {
  const avail = checkDate(day, deps.today());
  try { const r = await deps.viaApi(day); if (r?.series) return r; } catch { /* backend asleep / not configured */ }
  const out: ReplayRain = {
    date: day, timezone: TZ, step_hours: 1, series: {}, totals_mm: {}, notes: [],
    statement: "Replay of a past day for honest checking against what was reported. Rain series are model-based, not rain-gauge records.",
  };
  const tryGet = async (k: ReplaySeriesKey, u: string, v: string, label: string) => {
    try { out.series[k] = seriesFor(await deps.direct(u), v, day); }
    catch (e) { out.notes.push(`${label}: ${e instanceof ReplayUnavailable ? e.message : "could not reach the service"}`); }
  };
  if (avail.forecast_day_ahead) await tryGet("forecast_day_ahead", url(PREVIOUS_RUNS_URL, lat, lon, day, FORECAST_VAR), FORECAST_VAR, "day-ahead forecast");
  else out.notes.push(`day-ahead forecasts are archived from ${FORECAST_ARCHIVE_START} only`);
  if (avail.actual) await tryGet("actual", url(ARCHIVE_URL, lat, lon, day, "precipitation"), "precipitation", "actual rain");
  else out.notes.push(`the rain archive is about ${ARCHIVE_DELAY_DAYS} days behind; try an earlier date`);
  if (Object.keys(out.series).length === 0) throw new ReplayUnavailable(out.notes.join("; ") || "no rain series available");
  for (const [k, v] of Object.entries(out.series)) out.totals_mm[k as ReplaySeriesKey] = Math.round(v!.reduce((a, b) => a + b, 0) * 10) / 10;
  return out;
}

// ---------------------------------------------------------------- observed reports + scoring
export interface ObservedReport {
  event_date: string; place_name: string; lat: number; lon: number; description?: string; depth_reported?: string;
  source_url: string; source_type: "news" | "official" | "team_visit"; collected_by?: string; collected_on?: string;
}

export async function loadObserved(): Promise<ObservedReport[]> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/observed_waterlogging.json`);
    if (!r.ok) return [];
    const j = (await r.json()) as { reports?: ObservedReport[] };
    return Array.isArray(j.reports) ? j.reports : [];
  } catch { return []; }
}

export interface ReportCheck { report: ObservedReport; hit: boolean; nearestFlaggedM: number | null }
export interface ValidationResult {
  date: string; checks: ReportCheck[]; hits: number; misses: number; outside: number;
  flaggedWithoutReport: number; radiusM: number;
}

/** Compare a FINAL scenario result with the reports for one date. A report is a hit if a Higher/Highest zone's centre
 * lies within HIT_RADIUS_M. Flagged zones with no report nearby are counted but NOT called false alarms:
 * no report does not mean no flooding. */
export function scoreReports(ds: Dataset, res: ScenarioResult, reports: ObservedReport[], day: string, radiusM = HIT_RADIUS_M): ValidationResult {
  const { origin, m_per_deg, size_m } = ds.meta;
  const flagged = ds.zones.zones.filter((_, i) => res.zones[i].band === "higher" || res.zones[i].band === "highest");
  const checks: ReportCheck[] = []; let outside = 0;
  const reported: { x: number; y: number }[] = [];
  for (const r of reports.filter((r) => r.event_date === day)) {
    const x = (r.lon - origin.lon) * m_per_deg.lon, y = (r.lat - origin.lat) * m_per_deg.lat;
    if (x < 0 || y < 0 || x > size_m[0] || y > size_m[1]) { outside++; continue; }
    reported.push({ x, y });
    let best: number | null = null;
    for (const z of flagged) { const d = Math.hypot(z.cx - x, z.cy - y); if (best === null || d < best) best = d; }
    checks.push({ report: r, hit: best !== null && best <= radiusM, nearestFlaggedM: best === null ? null : Math.round(best) });
  }
  const flaggedWithoutReport = flagged.filter((z) => !reported.some((p) => Math.hypot(z.cx - p.x, z.cy - p.y) <= radiusM)).length;
  const hits = checks.filter((c) => c.hit).length;
  return { date: day, checks, hits, misses: checks.length - hits, outside, flaggedWithoutReport, radiusM };
}
