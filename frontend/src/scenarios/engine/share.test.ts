import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeScenario, encodeScenario, scenarioFromHash, shareUrl } from "./share";
import { BASELINE } from "./risk";
import { stepStorm } from "../../maps/twin3d/sim/storm";
import type { Dataset, Scenario } from "./types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const id0 = ds.inlets[0].id, id1 = ds.inlets[1].id;

describe("share links", () => {
  it("round-trips a full scenario", () => {
    const sc: Scenario = { ...BASELINE, name: "Cyclone తుఫాను test", rainfallMm: 142.5, durationH: 9, blockageFrac: 0.35, pumps: true,
      soilWetness: 0.8, seaLevelM: 1.2, overrides: { [id0]: "blocked", [id1]: "cleared" } };
    const back = decodeScenario(encodeScenario(sc), ds)!;
    expect(back).toMatchObject({ name: sc.name, rainfallMm: 142.5, durationH: 9, blockageFrac: 0.35, pumps: true, soilWetness: 0.8, seaLevelM: 1.2, overrides: sc.overrides });
  });
  it("round-trips an hourly storm", () => {
    const sc: Scenario = { ...BASELINE, storm: stepStorm([0, 12.5, 40, 3], 1), rainfallMm: 55.5, durationH: 4 };
    const back = decodeScenario(encodeScenario(sc), ds)!;
    expect(back.storm!.mm).toEqual([0, 12.5, 40, 3]);
    expect(back.rainfallMm).toBe(55.5); expect(back.durationH).toBe(4);
  });
  it("reads the hash of a share URL", () => {
    const url = shareUrl({ ...BASELINE, rainfallMm: 80 }, "https://x.app/?a=1#old");
    expect(url.startsWith("https://x.app/?a=1#s=")).toBe(true);
    expect(scenarioFromHash(url.slice(url.indexOf("#")), ds)!.rainfallMm).toBe(80);
    expect(scenarioFromHash("#nothing", ds)).toBeNull();
  });
  it("rejects or clamps bad links", () => {
    const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
    expect(decodeScenario("!!!", ds)).toBeNull();
    expect(decodeScenario(enc({ v: 9, r: 10, d: 1, b: 0 }), ds)).toBeNull();
    expect(decodeScenario(enc({ v: 1, r: "x", d: 1, b: 0 }), ds)).toBeNull();
    const c = decodeScenario(enc({ v: 1, n: "", r: 99999, d: 0, b: 7, w: -3, s: 40, o: { nope: 1, [id0]: 5 }, st: [1, -5] }), ds)!;
    expect(c).toMatchObject({ name: "Shared scenario", rainfallMm: 1000, durationH: 1, blockageFrac: 1, soilWetness: 0, seaLevelM: 3, overrides: {} });
    expect(c.storm).toBeUndefined();
  });
});
