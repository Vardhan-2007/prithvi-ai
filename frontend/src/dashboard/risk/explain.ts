import type { Scenario, Zone, ZoneResult } from "../../scenarios/engine/types";
import { tr } from "../../components/i18n/i18n";
import type { Lang } from "../../components/i18n/i18n";

/** Plain-language reasons behind a zone's score (EN / Telugu). Every sentence is derived from the numbers. */
export function explainZone(lang: Lang, z: Zone, r: ZoneResult, base: ZoneResult, sc: Scenario, intensity: number): string[] {
  const t = (k: string, p?: Record<string, string | number>) => tr(lang, k, p);
  const out: string[] = [];
  const lvl = (v: number) => (v >= 0.66 ? "high" : v <= 0.33 ? "low" : "mid");
  out.push(t(`why.terrain.${lvl(r.factors.terrain)}`, { v: r.factors.terrain.toFixed(2), elev: z.mean_elev.toFixed(1) }));
  out.push(t("why.rain", { mm: sc.rainfallMm, h: sc.durationH, i: intensity.toFixed(0), f: r.factors.rainfall.toFixed(2) }));
  out.push(t(r.openInlets < r.totalInlets ? "why.drain.blocked" : "why.drain.ok", {
    open: r.openInlets, total: r.totalInlets, cap: Math.round(r.drainCapacity * 100), v: r.factors.drainage.toFixed(2),
  }));
  out.push(t("why.exposure", { b: z.n_buildings, road: Math.round(z.road_m), fac: z.facilities.health + z.facilities.emergency + z.facilities.shelter }));
  const d = r.index - base.index;
  out.push(t(Math.abs(d) < 0.05 ? "why.delta.none" : d > 0 ? "why.delta.up" : "why.delta.down", { d: Math.abs(d).toFixed(1), base: base.index.toFixed(1) }));
  return out;
}
