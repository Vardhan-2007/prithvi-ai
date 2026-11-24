import { describe, expect, it } from "vitest";
import { stepStorm, stormCumulativeMm, stormDurationH, stormHourlyBars, stormPeakMmH, stormRateMmH, stormTotalMm, triangleStorm } from "./storm";
import { cumulativeRainMm, rainRateMmH } from "./floodSolver";

const IRREGULAR = [0, 4, 18, 35, 9, 0, 12, 2];

describe("storms", () => {
  it("triangle storm matches the original helpers exactly", () => {
    const t = triangleStorm(100, 6);
    for (const s of [0, 1000, 10800, 15000, 21599, 30000]) {
      expect(stormRateMmH(t, s)).toBe(rainRateMmH(s, 100, 6));
      expect(stormCumulativeMm(t, s)).toBe(cumulativeRainMm(s, 100, 6));
    }
    expect(stormPeakMmH(t)).toBeCloseTo(33.333, 3);
  });
  it("step storm integrates, is piecewise constant and reports its peak", () => {
    const s = stepStorm(IRREGULAR);
    expect(stormDurationH(s)).toBe(8);
    expect(stormTotalMm(s)).toBe(80);
    expect(stormCumulativeMm(s, 8 * 3600)).toBeCloseTo(80, 9);
    expect(stormCumulativeMm(s, 99 * 3600)).toBeCloseTo(80, 9);
    expect(stormCumulativeMm(s, 3.5 * 3600)).toBeCloseTo(39.5, 9);
    expect(stormRateMmH(s, 3 * 3600 + 10)).toBe(35);
    expect(stormRateMmH(s, 8 * 3600)).toBe(0);
    expect(stormPeakMmH(s)).toBe(35);
    expect(stormHourlyBars(s).map((v) => Math.round(v * 1e6) / 1e6)).toEqual(IRREGULAR);
  });
  it("supports sub-hourly steps", () => {
    const s = stepStorm([10, 20], 0.5);
    expect(stormRateMmH(s, 0.6 * 3600)).toBe(40);
    expect(stormDurationH(s)).toBe(1);
    expect(stormHourlyBars(s)[0]).toBeCloseTo(30, 9);
  });
  it("rejects invalid hyetographs", () => {
    for (const bad of [[], [-1], [400], [Number.NaN]]) expect(() => stepStorm(bad)).toThrow();
    expect(() => stepStorm([1], 0)).toThrow();
  });
});
