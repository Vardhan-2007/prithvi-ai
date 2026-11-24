import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatInr, moneyCurve, planPatch } from "./budget";
import { BASELINE, evaluate } from "./risk";
import type { Dataset, Scenario } from "./types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const sc: Scenario = { ...BASELINE, name: "t", rainfallMm: 180, durationH: 6, blockageFrac: 0.4 };

describe("money curve", () => {
  const t0 = performance.now();
  const pts = moneyCurve(ds, sc);
  const ms = performance.now() - t0;
  it("is quick enough for the browser", () => { expect(ms).toBeLessThan(3000); });
  it("starts at zero cost, spends more each step and never raises harm", () => {
    expect(pts[0].cost).toBe(0); expect(pts[0].action).toBeNull();
    expect(pts.length).toBeGreaterThan(3);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].cost).toBeGreaterThan(pts[i - 1].cost);
      expect(pts[i].harm).toBeLessThan(pts[i - 1].harm);
    }
    expect(pts.at(-1)!.flagged).toBeLessThanOrEqual(pts[0].flagged);
  });
  it("the plan patch reproduces the last point", () => {
    const n = pts.length - 1;
    const r = evaluate(ds, { ...sc, ...planPatch(sc, pts, n) });
    expect(r.zones.filter((z) => z.band === "higher" || z.band === "highest").length).toBe(pts[n].flagged);
  });
  it("does nothing when nothing is blocked and pumps are out", () => {
    expect(moneyCurve(ds, { ...sc, blockageFrac: 0, pumps: true })).toHaveLength(1);
  });
  it("formats rupees", () => { expect(formatInr(15000)).toBe("₹15k"); expect(formatInr(240000)).toBe("₹2.4 lakh"); });
});
