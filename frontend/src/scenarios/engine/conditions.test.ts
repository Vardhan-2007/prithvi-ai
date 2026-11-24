import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getConditions, maxSeaLevel, soilMoistureAt, wetnessFromMoisture } from "./conditions";
import { buildSolverInit, drainFactor, FloodSolver, perviousRunoff, DT, RUNOFF_PERVIOUS } from "../../maps/twin3d/sim/floodSolver";
import { BASELINE, evaluate } from "./risk";
import type { Dataset } from "./types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));

describe("condition curves", () => {
  it("are neutral at the defaults and bounded", () => {
    expect(perviousRunoff(0)).toBe(RUNOFF_PERVIOUS);
    expect(perviousRunoff(1)).toBeCloseTo(0.9, 9);
    expect(perviousRunoff(5)).toBeCloseTo(0.9, 9);
    expect(perviousRunoff(Number.NaN)).toBe(RUNOFF_PERVIOUS);
    expect(drainFactor(0)).toBe(1);
    expect(drainFactor(0.5)).toBe(1);
    expect(drainFactor(1.25)).toBeCloseTo(0.65, 9);
    expect(drainFactor(3)).toBeCloseTo(0.3, 9);
  });
  it("maps soil moisture to wetness", () => {
    expect(wetnessFromMoisture(0.1)).toBe(0);
    expect(wetnessFromMoisture(0.3)).toBe(0.5);
    expect(wetnessFromMoisture(0.6)).toBe(1);
  });
});

describe("flood solver with conditions", () => {
  const run = (cond?: { soilWetness: number; seaLevelM: number }) => {
    const res = evaluate(ds, { ...BASELINE, rainfallMm: 60, durationH: 2, blockageFrac: 0.25 });
    const s = new FloodSolver(buildSolverInit(ds, res.inletOpen, [], 60, 2, 0, cond));
    for (let i = 0; i < 3600 / DT; i++) s.step(DT);
    return s.stats();
  };
  it("neutral conditions give exactly the original model", () => {
    expect(run({ soilWetness: 0, seaLevelM: 0 })).toEqual(run());
  });
  it("wet ground means more water, high sea means less drained", () => {
    const base = run(), wet = run({ soilWetness: 1, seaLevelM: 0 }), sea = run({ soilWetness: 0, seaLevelM: 2 });
    expect(wet.storedM3 + wet.drainM3 + wet.outfallM3).toBeGreaterThan(base.storedM3 + base.drainM3 + base.outfallM3);
    expect(sea.drainM3).toBeLessThan(base.drainM3);
    expect(sea.storedM3).toBeGreaterThan(base.storedM3);
  });
  it("high sea raises the drainage factor of the risk index", () => {
    const sc = { ...BASELINE, rainfallMm: 100, durationH: 6 };
    const a = evaluate(ds, sc), b = evaluate(ds, { ...sc, seaLevelM: 2 });
    expect(b.meanIndex).toBeGreaterThan(a.meanIndex);
    expect(evaluate(ds, { ...sc, seaLevelM: 0.4 }).meanIndex).toBe(a.meanIndex);
  });
});

describe("parsing", () => {
  const soil = { hourly: { time: ["2026-11-03T00:00", "2026-11-03T01:00"], soil_moisture_0_to_1cm: [0.3, 0.4], soil_moisture_1_to_3cm: [0.32, null] } };
  const sea = { hourly: { time: ["2026-11-03T00:00", "2026-11-03T01:00", "2026-11-03T02:00"], sea_level_height_msl: [0.2, 0.71, null] } };
  it("reads soil moisture at the hour", () => {
    expect(soilMoistureAt(soil, "2026-11-03T00:00")).toBe(0.31);
    expect(soilMoistureAt(soil, "2026-11-03T00:30")).toBe(0.4);
    expect(soilMoistureAt({}, "2026-11-03T00:00")).toBeNull();
  });
  it("reads the highest sea level in the window", () => {
    expect(maxSeaLevel(sea, "2026-11-03T00:00", 24)).toBe(0.71);
    expect(maxSeaLevel(sea, "2026-11-03T00:00", 1)).toBe(0.2);
    expect(maxSeaLevel({ hourly: { time: [] } }, "2026-11-03T00:00", 24)).toBeNull();
  });
  it("never throws, and says what is missing", async () => {
    const r = await getConditions(16.95, 82.24, { date: "2026-11-03", fetcher: async (u) => { if (u.includes("marine")) throw new Error("x"); return soil; } });
    expect(r.soilMoisture).toBe(0.31);
    expect(r.soilWetness).toBe(0.53);
    expect(r.seaLevelM).toBeNull();
    expect(r.notes).toEqual(["sea level not available"]);
  });
});
