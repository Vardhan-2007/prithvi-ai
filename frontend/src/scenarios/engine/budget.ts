// "What does money buy?"  A greedy plan of cheap actions, ranked by how much flood risk each rupee removes.
//
// Actions: clear one blocked drain inlet, or put out the temporary pumps (all PUMP_COUNT together, as in the scenario).
// Costs are PLACEHOLDERS the user can edit; they are not quotes. Risk uses the instant (provisional) index, because a
// flood run per candidate action would take minutes. "Harm" = sum over zones of how far the index is above the
// Moderate threshold, weighted by exposure (people, roads, facilities), so moving a busy zone down counts more.
import { BAND_THRESHOLDS, evaluate, isFlagged, PUMP_COUNT } from "./risk";
import type { Dataset, Scenario, ScenarioResult } from "./types";

export const DEFAULT_COSTS = { clearInr: 15000, pumpInr: 40000 };   // per inlet desilted; per pump per event (assumed)
export type Costs = typeof DEFAULT_COSTS;
export type BudgetAction = { kind: "clear"; inletId: string } | { kind: "pumps" };

export interface BudgetPoint { cost: number; flagged: number; harm: number; action: BudgetAction | null }

export function harmOf(ds: Dataset, res: ScenarioResult): number {
  let h = 0;
  res.zones.forEach((z, k) => { h += Math.max(0, z.index - BAND_THRESHOLDS.moderate) * (0.6 + 0.4 * ds.zones.zones[k].exposure); });
  return h;
}
const flaggedOf = (res: ScenarioResult) => res.zones.filter(isFlagged).length;
const actionCost = (a: BudgetAction, c: Costs) => (a.kind === "pumps" ? c.pumpInr * PUMP_COUNT : c.clearInr);
function apply(sc: Scenario, a: BudgetAction): Scenario {
  return a.kind === "pumps" ? { ...sc, pumps: true } : { ...sc, overrides: { ...sc.overrides, [a.inletId]: "cleared" } };
}

/** Point 0 is "spend nothing"; each next point adds the action with the largest harm removed per rupee.
 * Stops when no action helps any more or after maxSteps. */
export function moneyCurve(ds: Dataset, sc: Scenario, costs: Costs = DEFAULT_COSTS, maxSteps = 40, water?: number[]): BudgetPoint[] {
  // With `water` (the finished flood run's W per zone) the index is the FINAL one, with that water held fixed:
  // clearing drains and pumps then act through the drainage factor only, and the counts match what the app shows.
  const opts = water ? { water } : undefined;
  let cur = { ...sc, overrides: { ...sc.overrides } };
  let res = evaluate(ds, cur, opts);
  let harm = harmOf(ds, res);
  const pts: BudgetPoint[] = [{ cost: 0, flagged: flaggedOf(res), harm, action: null }];
  let spent = 0;
  for (let step = 0; step < maxSteps; step++) {
    const cands: BudgetAction[] = ds.inlets.filter((_, i) => !res.inletOpen[i]).map((inl) => ({ kind: "clear", inletId: inl.id }));
    if (!cur.pumps) cands.push({ kind: "pumps" });
    let best: { a: BudgetAction; sc: Scenario; res: ReturnType<typeof evaluate>; harm: number; gain: number } | null = null;
    for (const a of cands) {
      const s2 = apply(cur, a), r2 = evaluate(ds, s2, opts), h2 = harmOf(ds, r2);
      const gain = (harm - h2) / actionCost(a, costs);
      if (harm - h2 > 1e-9 && (!best || gain > best.gain)) best = { a, sc: s2, res: r2, harm: h2, gain };
    }
    if (!best) break;
    spent += actionCost(best.a, costs);
    cur = best.sc; res = best.res; harm = best.harm;
    pts.push({ cost: spent, flagged: flaggedOf(res), harm, action: best.a });
  }
  return pts;
}

/** The scenario change that carries out the first `n` steps of a plan. */
export function planPatch(sc: Scenario, pts: BudgetPoint[], n: number): Partial<Scenario> {
  const overrides = { ...sc.overrides };
  let pumps = sc.pumps;
  for (const p of pts.slice(1, n + 1)) {
    if (!p.action) continue;
    if (p.action.kind === "pumps") pumps = true; else overrides[p.action.inletId] = "cleared";
  }
  return { overrides, pumps };
}

export const formatInr = (v: number) => (v <= 0 ? "₹0" : v >= 1e5 ? `₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)} lakh` : `₹${Math.round(v / 1000)}k`);
