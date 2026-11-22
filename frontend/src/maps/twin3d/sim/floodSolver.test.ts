import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildSolverInit, FloodSolver, rainRateMmH, cumulativeRainMm, DT } from "./floodSolver";
import { evaluate, BASELINE } from "../../../scenarios/engine/risk";
import type { Dataset } from "../../../scenarios/engine/types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));

function run(mm: number, hrs: number, blockage: number, steps?: number) {
  const sc = { ...BASELINE, rainfallMm: mm, durationH: hrs, blockageFrac: blockage };
  const res = evaluate(ds, sc);
  const s = new FloodSolver(buildSolverInit(ds, res.inletOpen, [], mm, hrs));
  const total = steps ?? Math.round(s.totalSeconds / DT);
  for (let i = 0; i < total; i++) s.step(DT);
  return s;
}

describe("hyetograph", () => {
  it("integrates to the requested depth", () => {
    expect(cumulativeRainMm(6 * 3600, 100, 6)).toBeCloseTo(100, 4);
    expect(rainRateMmH(0.5 * 6 * 3600, 100, 6)).toBeCloseTo(33.33, 1);   // peak at the midpoint
    expect(rainRateMmH(0.25 * 6 * 3600, 100, 6)).toBeCloseTo(rainRateMmH(0.75 * 6 * 3600, 100, 6), 6); // symmetric
  });
});

describe("flood solver", () => {
  it("is deterministic and non-negative", () => {
    const a = run(60, 2, 0.25, 600), b = run(60, 2, 0.25, 600);
    expect(Array.from(a.h)).toEqual(Array.from(b.h));
    expect(Math.min(...a.h)).toBeGreaterThanOrEqual(0);
  });
  it("conserves mass: rain = stored + drained + outfall", () => {
    const s = run(80, 3, 0.5);
    const st = s.stats();
    expect(Math.abs(s.expectedRainM3() - (st.storedM3 + st.drainM3 + st.outfallM3)) / s.expectedRainM3()).toBeLessThan(0.02);
  });
  it("water recedes after the rain stops (rises, peaks, falls, ends dry)", () => {
    const sc = { ...BASELINE, rainfallMm: 60, durationH: 2, blockageFrac: 0.25 };
    const res = evaluate(ds, sc);
    const s = new FloodSolver(buildSolverInit(ds, res.inletOpen, [], 60, 2));
    let peakStored = 0, peakAt = 0, storedAtRainEnd = 0;
    const n = Math.round(s.totalSeconds / DT);
    for (let i = 0; i < n; i++) {
      s.step(DT);
      if (i % 60 === 0) { const st = s.stats(); if (st.storedM3 > peakStored) { peakStored = st.storedM3; peakAt = s.t; } }
      if (s.t === 2 * 3600) storedAtRainEnd = s.stats().storedM3;
    }
    const end = s.stats();
    expect(peakStored).toBeGreaterThan(0);
    expect(peakAt).toBeLessThanOrEqual(2 * 3600 + 1800);            // the water peaks around the end of the rain, not after
    expect(end.storedM3).toBeLessThan(0.1 * peakStored);            // and then goes back
    expect(end.storedM3).toBeLessThan(storedAtRainEnd);
    expect(end.floodedCells).toBe(0);
    expect(Math.abs(s.expectedRainM3() - (end.storedM3 + end.drainM3 + end.outfallM3)) / s.expectedRainM3()).toBeLessThan(0.02);
  });
  it("more blockage never reduces peak flooded area", () => {
    const open = run(100, 6, 0).stats(), blocked = run(100, 6, 0.75).stats();
    let po = 0, pb = 0;
    const a = run(100, 6, 0), b = run(100, 6, 0.75);
    for (const v of a.peak) if (v > 0.15) po++;
    for (const v of b.peak) if (v > 0.15) pb++;
    expect(pb).toBeGreaterThanOrEqual(po);
    expect(blocked.storedM3).toBeGreaterThanOrEqual(open.storedM3);
  });
});
