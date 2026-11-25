// Officer briefing: "sure" vs "maybe" picks, and a short, printable list of where to look first and what to do there.
//
// Sure / maybe compares two bracketing cases of the same scenario with the instant (provisional) index:
//   low  case: the forecast's low member (Live mode) or 70 % of the rain otherwise, and half the drain blockage
//   high case: the forecast's high member (Live mode) or 130 % of the rain otherwise, and 20 points more blockage
//   sure  = flagged (Higher or Highest) even in the low case
//   maybe = flagged only in the high case
// After the flood run (FINAL score, with simulated water W) the brackets use the same run's W scaled by the rain ratio
// (low/current <= 1, high/current >= 1): an ASSUMED shortcut, since a flood run per bracket would take minutes.
// Both cases are ASSUMED brackets, not probabilities. The index never falls with more rain, water or blockage, so
// low <= current <= high for every zone: every zone flagged now is "sure" or "maybe", and every "sure" zone is flagged.
import { evaluate, isFlagged, rankPriority, type PriorityItem } from "./risk";
import type { Dataset, Facility, Scenario, ScenarioResult } from "./types";
import { stepStorm } from "../../maps/twin3d/sim/storm";
import { nearestStreet } from "./places";
export { nearestStreet } from "./places";

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
    // the current case may itself be the low or high member: keep low <= current <= high
    const low = forecast.low.total_mm <= sc.rainfallMm ? withStorm(sc, forecast.low, "forecast low") : sc;
    const high = forecast.high.total_mm >= sc.rainfallMm ? withStorm(sc, forecast.high, "forecast high") : sc;
    return {
      low: { ...low, blockageFrac: lowB },
      high: { ...high, blockageFrac: highB },
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

export function certainty(ds: Dataset, range: Range, current?: ScenarioResult): Map<string, Certainty> {
  let lowOpts: { water: number[] } | undefined, highOpts: { water: number[] } | undefined;
  if (current?.stage === "final") {
    const mm = Math.max(1e-6, current.scenario.rainfallMm);
    const rl = Math.min(1, range.low.rainfallMm / mm), rh = Math.max(1, range.high.rainfallMm / mm);
    const w = current.zones.map((z) => z.factors.water);
    lowOpts = { water: w.map((v) => clamp01(v * rl)) }; highOpts = { water: w.map((v) => clamp01(v * rh)) };
  }
  const low = evaluate(ds, range.low, lowOpts), high = evaluate(ds, range.high, highOpts);
  const out = new Map<string, Certainty>();
  low.zones.forEach((z, k) => out.set(z.id, isFlagged(z) ? "sure" : isFlagged(high.zones[k]) ? "maybe" : "no"));
  return out;
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
  const cert = certainty(ds, range, res);
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
