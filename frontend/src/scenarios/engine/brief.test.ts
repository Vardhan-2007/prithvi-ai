import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildBrief, briefText, certainty, nearestStreet, rangeCases } from "./brief";
import { BASELINE, evaluate } from "./risk";
import { stepStorm } from "../../maps/twin3d/sim/storm";
import type { Dataset, Scenario } from "./types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const sc: Scenario = { ...BASELINE, name: "test", rainfallMm: 150, durationH: 6, blockageFrac: 0.3 };
const t = (k: string, p?: Record<string, string | number>) => k + (p ? JSON.stringify(p) : "");

describe("sure / maybe", () => {
  it("brackets the scenario", () => {
    const r = rangeCases(sc);
    expect(r.basis).toBe("assumed");
    expect(r.low.rainfallMm).toBe(105); expect(r.high.rainfallMm).toBe(195);
    expect(r.low.blockageFrac).toBeCloseTo(0.15); expect(r.high.blockageFrac).toBeCloseTo(0.5);
  });
  it("uses the forecast members in Live mode, and scales a storm otherwise", () => {
    const f = rangeCases(sc, { low: { hyetograph_mm: [1, 2], total_mm: 3 }, high: { hyetograph_mm: [10, 20, 5], total_mm: 35 } });
    expect(f.basis).toBe("forecast");
    expect(f.low.rainfallMm).toBe(3); expect(f.high.durationH).toBe(3); expect(f.high.storm!.mm).toEqual([10, 20, 5]);
    const s = rangeCases({ ...sc, storm: stepStorm([10, 250], 1) });
    expect(s.high.storm!.mm).toEqual([13, 300]);
  });
  it("every sure zone is flagged in the scenario's high case, and sure zones exist in a heavy storm", () => {
    const range = rangeCases(sc);
    const c = certainty(ds, range);
    const high = evaluate(ds, range.high);
    const sure = [...c.entries()].filter(([, v]) => v === "sure").map(([k]) => k);
    expect(sure.length).toBeGreaterThan(0);
    for (const id of sure) expect(["higher", "highest"]).toContain(high.zones.find((z) => z.id === id)!.band);
  });
});

describe("brief", () => {
  it("lists ranked zones with places and actions", () => {
    const res = evaluate(ds, { ...sc, pumps: true });
    const b = buildBrief(ds, res, rangeCases(sc));
    expect(b.items).toHaveLength(6);
    expect(b.items.map((i) => i.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const it of b.items) {
      expect(it.actions.at(-1)!.kind).toBe("inspect");
      expect(it.lat).toBeGreaterThan(16.94); expect(it.lat).toBeLessThan(16.96);
      expect(it.lon).toBeGreaterThan(82.23); expect(it.lon).toBeLessThan(82.25);
    }
    expect(b.items.some((i) => i.actions.some((a) => a.kind === "pump"))).toBe(true);
    expect(b.items.some((i) => i.street)).toBe(true);
    const txt = briefText(b, t, "now");
    expect(txt).toContain("br.title"); expect(txt).toContain(b.items[0].zoneId);
  });
  it("finds the nearest named street", () => {
    const r = ds.roads.find((x) => x.name)!;
    expect(nearestStreet(ds, r.pts[0][0], r.pts[0][1])).toEqual({ name: expect.any(String), distM: 0 });
  });
});
