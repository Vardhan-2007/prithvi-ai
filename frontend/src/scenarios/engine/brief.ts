// Officer briefing: "sure" vs "maybe" picks, and a short, printable list of where to look first and what to do there.
//
// Sure / maybe compares two bracketing cases of the same scenario with the instant (provisional) index:
//   low  case: the forecast's low member (Live mode) or 70 % of the rain otherwise, and half the drain blockage
//   high case: the forecast's high member (Live mode) or 130 % of the rain otherwise, and 20 points more blockage
//   sure  = flagged (Higher or Highest) even in the low case
//   maybe = flagged only in the high case
// Both cases are ASSUMED brackets, not probabilities. More rain and more blockage never lower the index, so every
// "sure" zone is also flagged in the high case.
import { evaluate, isFlagged, rankPriority, type PriorityItem } from "./risk";
import type { Dataset, Facility, Scenario, ScenarioResult } from "./types";
import { stepStorm } from "../../maps/twin3d/sim/storm";

export type Certainty = "sure" | "maybe" | "no";
export const LOW_RAIN = 0.7, HIGH_RAIN = 1.3, LOW_BLOCK = 0.5, HIGH_BLOCK_ADD = 0.2;
export const BRIEF_ZONES = 6;
export const NEAR_FACILITY_M = 120;

export interface RangeCase { hyetograph_mm: number[]; total_mm: number }
export interface Range { low: Scenario; high: Scenario; basis: "forecast" | "assumed" }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

function withStorm(sc: Scenario, c: RangeCase, label: string): Scenario {
  const storm = stepStorm(c.hyetograph_mm, 1, { label });
  return { ...sc, storm, rainfallMm: r1(c.total_mm), durationH: c.hyetograph_mm.length };
}

/** The low and high bracketing cases of a scenario. Pass the forecast's low / high members in Live mode. */
export function rangeCases(sc: Scenario, forecast?: { low: RangeCase; high: RangeCase } | null): Range {
  const lowB = clamp01(sc.blockageFrac * LOW_BLOCK), highB = clamp01(sc.blockageFrac + HIGH_BLOCK_ADD);
  if (forecast) {
    return {
      low: { ...withStorm(sc, forecast.low, "forecast low"), blockageFrac: lowB },
      high: { ...withStorm(sc, forecast.high, "forecast high"), blockageFrac: highB },
      basis: "forecast",
    };
  }
  const scale = (k: number): Partial<Scenario> => {
    if (!sc.storm) return { rainfallMm: r1(sc.rainfallMm * k) };
    const mm = sc.storm.mm.map((v) => Math.min(300, v * k));
    return { storm: { ...sc.storm, mm }, rainfallMm: r1(mm.reduce((a, b) => a + b, 0)) };
  };
  return { low: { ...sc, ...scale(LOW_RAIN), blockageFrac: lowB }, high: { ...sc, ...scale(HIGH_RAIN), blockageFrac: highB }, basis: "assumed" };
}

export function certainty(ds: Dataset, range: Range): Map<string, Certainty> {
  const low = evaluate(ds, range.low), high = evaluate(ds, range.high);
  const out = new Map<string, Certainty>();
  low.zones.forEach((z, k) => out.set(z.id, isFlagged(z) ? "sure" : isFlagged(high.zones[k]) ? "maybe" : "no"));
  return out;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L > 0 ? clamp01(((px - ax) * dx + (py - ay) * dy) / L) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Nearest named street to a point (local metres), or null if no named street is mapped. */
export function nearestStreet(ds: Dataset, x: number, y: number): { name: string; distM: number } | null {
  let best: { name: string; distM: number } | null = null;
  for (const r of ds.roads) {
    if (!r.name) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const d = segDist(x, y, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
      if (!best || d < best.distM) best = { name: r.name, distM: Math.round(d) };
    }
  }
  return best;
}

export type Action =
  | { kind: "clear"; inlets: string[] }
  | { kind: "pump" }
  | { kind: "prepump" }
  | { kind: "access"; names: string[] }
  | { kind: "inspect" };

export interface BriefItem {
  rank: number; zoneId: string; index: number; band: string; certainty: Certainty;
  street: string | null; streetDistM: number | null; lon: number; lat: number;
  facilities: Facility[]; actions: Action[]; item: PriorityItem;
}

export interface Brief {
  scenario: Scenario; stage: ScenarioResult["stage"]; basis: Range["basis"];
  counts: { sure: number; maybe: number };
  byZone: Record<string, Certainty>;
  items: BriefItem[];
}

export function buildBrief(ds: Dataset, res: ScenarioResult & { pumpSites?: { zoneId: string }[] }, range: Range, n = BRIEF_ZONES): Brief {
  const cert = certainty(ds, range);
  const pumpZones = new Set((res.pumpSites ?? []).map((p) => p.zoneId));
  const { origin, m_per_deg } = ds.meta;
  const items = rankPriority(ds, res, n).map((it, k): BriefItem => {
    const z = it.zone;
    const st = nearestStreet(ds, z.cx, z.cy);
    const facilities = ds.facilities.filter((f) => f.category !== "other" && Math.hypot(f.x - z.cx, f.y - z.cy) <= NEAR_FACILITY_M);
    const blocked = z.inlets.filter(([i]) => !res.inletOpen[i]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i]) => ds.inlets[i].id);
    const c = cert.get(z.id) ?? "no";
    const actions: Action[] = [];
    if (blocked.length) actions.push({ kind: "clear", inlets: blocked });
    if (pumpZones.has(z.id)) actions.push({ kind: "pump" });
    else if (c === "sure" && (it.topFactor === "drainage" || it.topFactor === "water")) actions.push({ kind: "prepump" });
    if (facilities.length) actions.push({ kind: "access", names: facilities.map((f) => f.name) });
    actions.push({ kind: "inspect" });
    return {
      rank: k + 1, zoneId: z.id, index: Math.round(it.result.index), band: it.result.band, certainty: c,
      street: st && st.distM <= 150 ? st.name : null, streetDistM: st ? st.distM : null,
      lon: Math.round((origin.lon + z.cx / m_per_deg.lon) * 1e5) / 1e5, lat: Math.round((origin.lat + z.cy / m_per_deg.lat) * 1e5) / 1e5,
      facilities, actions, item: it,
    };
  });
  let sure = 0, maybe = 0;
  for (const v of cert.values()) { if (v === "sure") sure++; else if (v === "maybe") maybe++; }
  return { scenario: res.scenario, stage: res.stage, basis: range.basis, counts: { sure, maybe }, byZone: Object.fromEntries(cert), items };
}

type T = (k: string, p?: Record<string, string | number>) => string;

export function actionText(a: Action, t: T): string {
  switch (a.kind) {
    case "clear": return t("br.act.clear", { ids: a.inlets.join(", ") });
    case "pump": return t("br.act.pump");
    case "prepump": return t("br.act.prepump");
    case "access": return t("br.act.access", { names: a.names.join(", ") });
    default: return t("br.act.inspect");
  }
}

/** Plain text for pasting into a message (WhatsApp, SMS, email). */
export function briefText(b: Brief, t: T, when: string): string {
  const sc = b.scenario;
  const lines = [
    t("br.title"), when,
    t("br.scenario", { name: sc.name, mm: sc.rainfallMm, h: sc.durationH, b: Math.round(sc.blockageFrac * 100) }),
    t("br.counts", { sure: b.counts.sure, maybe: b.counts.maybe }), "",
  ];
  for (const it of b.items) {
    lines.push(`${it.rank}. ${it.street ?? it.zoneId} (${it.zoneId}) · ${t(`br.cert.${it.certainty}`)} · ${it.index}`);
    lines.push(`   ${it.lat}, ${it.lon}`);
    for (const a of it.actions) lines.push(`   - ${actionText(a, t)}`);
  }
  lines.push("", t("br.footer"));
  return lines.join("\n");
}
