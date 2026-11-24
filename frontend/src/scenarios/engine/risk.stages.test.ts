import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BASELINE, evaluate, WEIGHTS, WEIGHTS_FINAL, zoneWater } from "./risk";
import type { Dataset } from "./types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const n = ds.grid.nx * ds.grid.ny, Z = ds.zones.zones.length;
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe("risk index stages", () => {
  it("both weight sets sum to 1; the final set drops the uniform rain term", () => {
    expect(sum(WEIGHTS)).toBeCloseTo(1, 12);
    expect(sum(WEIGHTS_FINAL)).toBeCloseTo(1, 12);
    expect(WEIGHTS_FINAL.rainfall).toBe(0);
  });
  it("is provisional without water and final with it", () => {
    const sc = { ...BASELINE, rainfallMm: 200, durationH: 4, blockageFrac: 0.5 };
    expect(evaluate(ds, sc).stage).toBe("provisional");
    const f = evaluate(ds, sc, { water: new Array(Z).fill(0.3) });
    expect(f.stage).toBe("final");
    for (const z of f.zones) expect(sum(z.contrib)).toBeCloseTo(z.index, 9);
  });
  it("a dry zone can never reach the Highest band in the final score", () => {
    const f = evaluate(ds, { ...BASELINE, rainfallMm: 300, durationH: 4, blockageFrac: 0.75 }, { water: new Array(Z).fill(0) });
    expect(f.bandCounts.highest).toBe(0);
  });
  it("more simulated water never lowers a zone's final score", () => {
    const sc = { ...BASELINE, rainfallMm: 100, durationH: 6, blockageFrac: 0.25 };
    const a = evaluate(ds, sc, { water: new Array(Z).fill(0.1) }), b = evaluate(ds, sc, { water: new Array(Z).fill(0.6) });
    a.zones.forEach((z, i) => expect(b.zones[i].index).toBeGreaterThanOrEqual(z.index));
  });
  it("zoneWater is 0 for a dry grid and within 0..1 otherwise", () => {
    expect(zoneWater(ds, new Float32Array(n))).toEqual(new Array(Z).fill(0));
    const w = zoneWater(ds, Float32Array.from({ length: n }, (_, c) => (c % 7) * 0.1));
    for (const v of w) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
  it("rejects a water array of the wrong length", () => {
    expect(() => evaluate(ds, BASELINE, { water: [0.1] })).toThrow();
  });
  it("the shipped baseline water file matches the zones", () => {
    const bw = JSON.parse(readFileSync(new URL("../../../public/data/baseline_water.json", import.meta.url), "utf8"));
    expect(bw.water).toHaveLength(Z);
    expect(evaluate(ds, BASELINE, { water: bw.water }).stage).toBe("final");
  });
});
