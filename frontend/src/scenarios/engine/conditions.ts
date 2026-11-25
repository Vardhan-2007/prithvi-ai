// Ground and sea conditions for a scenario: how wet the ground already is, and how high the sea stands at the coast.
// Fetched from Open-Meteo straight from the browser (both APIs allow it). Every value can still be changed by hand.
//   * soil moisture: Open-Meteo forecast API (now) or the ERA5 archive (a replayed day, at its first hour)
//   * sea level: Open-Meteo Marine API `sea_level_height_msl` (tide model) at a point in Kakinada Bay. That series is NOT
//     centred on 0 (its monthly mean at Kakinada is ~0.6-0.7 m), so we use the highest level in the window MINUS the mean
//     of the last 31 days: the rise above the normal sea. Storm surge is not in the tide model; the user adds it by hand.
// The effects on the flood model are ASSUMED (see floodSolver.ts: perviousRunoff, drainFactor).

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
export const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
// A sea point in Kakinada Bay, east of the pilot (the pilot itself is on land, where the marine model has no value).
export const SEA_POINT = { lat: 16.97, lon: 82.3 };
// Volumetric soil moisture (m³/m³) that maps to wetness 0 and 1 (ASSUMED for the clayey coastal soils).
export const THETA_DRY = 0.15, THETA_WET = 0.45;

export interface ConditionsResult {
  soilWetness: number | null;      // 0..1, null = not available
  soilMoisture: number | null;     // m³/m³ as read
  seaLevelM: number | null;        // highest tide in the window, m above the 31-day mean sea level
  notes: string[];                 // what could not be loaded, in plain words
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

export function wetnessFromMoisture(theta: number): number {
  return r2(clamp01((theta - THETA_DRY) / (THETA_WET - THETA_DRY)));
}

type Hourly = { time?: unknown; [k: string]: unknown };
const hourlyOf = (payload: unknown): Hourly => ((payload as { hourly?: Hourly })?.hourly ?? {}) as Hourly;
const nums = (a: unknown): (number | null)[] =>
  Array.isArray(a) ? a.map((v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v))) : [];

/** Mean of the soil-moisture layers at the first hour at or after `stamp` ("YYYY-MM-DDTHH:00"); null if none. */
export function soilMoistureAt(payload: unknown, stamp: string): number | null {
  const h = hourlyOf(payload);
  const times = Array.isArray(h.time) ? (h.time as string[]) : [];
  let k = times.findIndex((t) => t >= stamp);
  if (k < 0) k = times.length - 1;
  if (k < 0) return null;
  const vals: number[] = [];
  for (const [key, series] of Object.entries(h)) {
    if (!key.startsWith("soil_moisture_")) continue;
    const v = nums(series)[k];
    if (v !== null && v !== undefined) vals.push(v);
  }
  return vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

/** Highest sea level in [from, from + hours) (GMT stamps) above the mean of the whole series (which should span the
 * previous ~31 days); null if the series is missing or too short for a mean. */
export function maxSeaLevel(payload: unknown, from: string, hours: number): number | null {
  const h = hourlyOf(payload);
  const times = Array.isArray(h.time) ? (h.time as string[]) : [];
  const v = nums(h.sea_level_height_msl);
  const start = times.findIndex((t) => t >= from);
  if (start < 0 || v.length !== times.length) return null;
  const all = v.filter((x): x is number => x !== null);
  if (all.length < 48) return null;                     // under two days: no meaningful mean
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  let best: number | null = null;
  for (let i = start; i < Math.min(times.length, start + hours); i++) {
    const x = v[i];
    if (x !== null && (best === null || x > best)) best = x;
  }
  return best === null ? null : r2(best - mean);
}

const minusDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") - n * 86400_000).toISOString().slice(0, 10);

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export function soilUrl(lat: number, lon: number, date?: string): string {
  if (date) return `${ARCHIVE_URL}?${q({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: "soil_moisture_0_to_7cm", start_date: date, end_date: date, timezone: "GMT" })}`;
  return `${FORECAST_URL}?${q({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: "soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm", forecast_days: "2", timezone: "GMT" })}`;
}
export function seaUrl(hours: number, date?: string): string {
  const base = { latitude: SEA_POINT.lat.toFixed(2), longitude: SEA_POINT.lon.toFixed(2), hourly: "sea_level_height_msl", timezone: "GMT" };
  if (date) return `${MARINE_URL}?${q({ ...base, start_date: minusDays(date, 30), end_date: date })}`;
  return `${MARINE_URL}?${q({ ...base, past_days: "31", forecast_days: String(Math.min(7, Math.ceil(hours / 24) + 1)) })}`;
}

type Fetcher = (url: string) => Promise<unknown>;
const defaultFetch: Fetcher = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.json(); };

/** Conditions for the next `hours` (live) or for a replayed `date` (YYYY-MM-DD, local day read in GMT). Never throws:
 * anything missing comes back as null with a note, and the scenario keeps its current value. */
export async function getConditions(lat: number, lon: number, opts: { hours?: number; date?: string; now?: Date; fetcher?: Fetcher } = {}): Promise<ConditionsResult> {
  const hours = opts.hours ?? 24, fetcher = opts.fetcher ?? defaultFetch;
  const stamp = opts.date ? `${opts.date}T00:00` : (opts.now ?? new Date()).toISOString().slice(0, 13) + ":00";
  const notes: string[] = [];
  const [soil, sea] = await Promise.allSettled([fetcher(soilUrl(lat, lon, opts.date)), fetcher(seaUrl(hours, opts.date))]);
  const soilMoisture = soil.status === "fulfilled" ? soilMoistureAt(soil.value, stamp) : null;
  if (soilMoisture === null) notes.push("ground wetness not available");
  const seaLevelM = sea.status === "fulfilled" ? maxSeaLevel(sea.value, stamp, opts.date ? 24 : hours) : null;
  if (seaLevelM === null) notes.push("sea level not available");
  return { soilMoisture, soilWetness: soilMoisture === null ? null : wetnessFromMoisture(soilMoisture), seaLevelM, notes };
}
