import { describe, expect, it } from "vitest";
import { statusSentence } from "./status";
import { tr } from "../../components/i18n/i18n";
import { stepStorm, stormRateMmH, triangleStorm, type Storm } from "../../maps/twin3d/sim/storm";
import type { LiveStats } from "../../maps/twin3d/sim/liveStats";

const D_H = 4, D = D_H * 3600;
const live = (t: number, o: Partial<LiveStats> = {}): LiveStats => ({
  t, rainMmH: 50, cumRainMm: 40, floodedHa: 10, maxDepth: 0.5, floodedBuildings: 0, roadKmAffected: 0, roadsAffected: 0, facilitiesAffected: 0,
  drainedM3: 0, outfallM3: 0, storedM3: 0, rainM3: 0, ...o,
});
const en = (k: string, p?: Record<string, string | number>) => tr("en", k, p);
const TRI = triangleStorm(200, D_H);
const s = (l: LiveStats | null, storm: Storm = TRI) => statusSentence(en, l, storm);
/** a snapshot at time t whose rain rate comes from the storm itself */
const at = (t: number, o: Partial<LiveStats> = {}) => live(t, { rainMmH: stormRateMmH(TRI, t), ...o });

describe("status sentence", () => {
  it("is empty before data, and 'dry' before any rain has fallen", () => {
    expect(s(null)).toBe("");
    expect(s(live(0, { cumRainMm: 0, floodedHa: 0 }))).toMatch(/Dry/);
  });
  it("says building, then at its peak around the midpoint, then easing", () => {
    expect(s(at(0.25 * D))).toMatch(/building/);
    expect(s(at(0.5 * D))).toMatch(/at its peak \(100 mm\/h\)/);
    expect(s(at(0.46 * D))).toMatch(/at its peak/);
    expect(s(at(0.54 * D))).toMatch(/at its peak/);
    expect(s(at(0.75 * D))).toMatch(/easing/);
  });
  it("never calls the exact peak 'easing' or 'building'", () => {
    expect(s(at(0.5 * D))).not.toMatch(/easing|building/);
  });
  it("after the rain: draining away, then almost dry", () => {
    expect(s(live(D + 600, { rainMmH: 0 }))).toMatch(/draining away/);
    expect(s(live(D + 3 * 3600, { rainMmH: 0, floodedHa: 0.01, maxDepth: 0.12 }))).toMatch(/almost dry/);
  });
  it("mentions the water and any facilities reached, in plain numbers", () => {
    const x = s(live(0.7 * D, { floodedHa: 24.04, maxDepth: 0.74, facilitiesAffected: 3 }));
    expect(x).toMatch(/About 24\.0 ha is under water, up to 0\.7 m deep/);
    expect(x).toMatch(/facilities reached: 3/);
  });
  it("every phase has a Telugu string", () => {
    for (const k of ["st.dry", "st.rising", "st.peak", "st.easing", "st.lull", "st.after", "st.done", "st.water", "st.none", "st.fac"]) {
      expect(tr("te", k, { r: 1, ha: 1, d: 1, n: 1 })).not.toBe(tr("en", k, { r: 1, ha: 1, d: 1, n: 1 }));
    }
  });
  it("follows a real hourly storm: its peak is wherever the strongest hour is, not the midpoint", () => {
    const f = stepStorm([2, 5, 40, 10, 3], 1);                     // 5 h, strongest hour is the third (peak at 2.5 h)
    const at = (h: number, rate: number) => s(live(h * 3600, { rainMmH: rate }), f);  // (shadows the helper above on purpose)
    expect(at(0.5, 2)).toMatch(/building/);
    expect(at(2.5, 40)).toMatch(/at its peak \(40 mm\/h\)/);
    expect(at(3.5, 10)).toMatch(/easing/);
  });
  it("calls a dry hour inside a storm a lull, not 'easing (0 mm/h)'", () => {
    const f = stepStorm([20, 0, 20], 1);
    expect(s(live(1.5 * 3600, { rainMmH: 0 }), f)).toMatch(/lull/);
  });
});
