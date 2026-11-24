// Field reports: waterlogging seen by the team or a ward officer, logged on this device. They are kept in the browser
// (localStorage), counted by the Replay check for their day, and can be downloaded in the same format as
// data/validation/observed_waterlogging.json so the team can review and merge them.
import type { Dataset } from "./types";
import type { ObservedReport } from "./replay";

export const STORAGE_KEY = "prithvi.fieldReports.v1";
export const DEPTHS = ["ankle", "knee", "waist", "unknown"] as const;
export type Depth = (typeof DEPTHS)[number];

export interface FieldInput { date: string; place: string; lat: number; lon: number; depth: Depth; note: string; by: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Problems with an input, in plain words (empty = fine). `today` is YYYY-MM-DD. */
export function checkInput(f: FieldInput, today: string): string[] {
  const out: string[] = [];
  if (!DATE.test(f.date) || Number.isNaN(Date.parse(f.date))) out.push("date");
  else if (f.date > today) out.push("future");
  if (f.place.trim().length < 3) out.push("place");
  if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon) || Math.abs(f.lat) > 90 || Math.abs(f.lon) > 180) out.push("location");
  if (!DEPTHS.includes(f.depth)) out.push("depth");
  return out;
}

export function isInsidePilot(ds: Dataset, lat: number, lon: number): boolean {
  const [w, s, e, n] = ds.meta.bbox;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

/** "16.9512, 82.2341" -> {lat, lon}; null if it does not parse. */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export function toReport(f: FieldInput, collectedOn: string, id: string): ObservedReport {
  return {
    event_date: f.date, place_name: f.place.trim(), lat: Math.round(f.lat * 1e6) / 1e6, lon: Math.round(f.lon * 1e6) / 1e6,
    description: f.note.trim() || undefined, depth_reported: f.depth,
    location_method: "Field report entered in the PRITHVI AI app (zone centre or typed coordinates).",
    source_url: `field-report:${id}`, source_type: "team_visit", collected_by: f.by.trim() || "field team", collected_on: collectedOn,
  };
}

export function loadFieldReports(): ObservedReport[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    const a = s ? (JSON.parse(s) as unknown) : [];
    return Array.isArray(a) ? (a as ObservedReport[]).filter((r) => r && typeof r.event_date === "string" && Number.isFinite(r.lat) && Number.isFinite(r.lon)) : [];
  } catch { return []; }
}

export function saveFieldReports(list: ObservedReport[]): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** JSON in the observed_waterlogging.json format, ready to review and merge into its `reports` list. */
export function exportJson(list: ObservedReport[]): string {
  return JSON.stringify({
    schema_version: 1,
    about: "Field reports exported from the PRITHVI AI app. Review each entry before merging it into data/validation/observed_waterlogging.json.",
    reports: list,
  }, null, 2);
}
