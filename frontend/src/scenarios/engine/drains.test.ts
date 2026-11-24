import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { drainStatics, drainWatchList, likeliestBlocked } from "./drains";
import { evaluate, BASELINE } from "./risk";
import type { Dataset } from "./types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const sc = { ...BASELINE, name: "t", rainfallMm: 200, durationH: 4, blockageFrac: 0 };

describe("drain susceptibility (indicative ranking)", () => {
  it("scores every proxy inlet in 0..1, deterministically", () => {
    const a = drainStatics(ds), b = drainStatics(ds);
    expect(a).toHaveLength(ds.inlets.length);
    for (const d of a) {
      expect(d.susceptibility).toBeGreaterThanOrEqual(0); expect(d.susceptibility).toBeLessThanOrEqual(1);
      for (const f of Object.values(d.factors)) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1); }
    }
    expect(a.map((d) => d.susceptibility)).toEqual(b.map((d) => d.susceptibility));
  });
  it("separates the drains: there are both higher- and lower-ranked ones", () => {
    const lv = new Set(drainStatics(ds).map((d) => d.level));
    expect(lv.has("low")).toBe(true); expect(lv.size).toBeGreaterThanOrEqual(2);
  });
  it("a blockage never lowers risk, and a pointless one is reported as zero impact", () => {
    const list = drainWatchList(ds, sc);
    expect(list).toHaveLength(ds.inlets.length);
    for (const d of list) { expect(d.impact.meanRise).toBeGreaterThanOrEqual(-1e-9); expect(d.inspectScore).toBeGreaterThanOrEqual(0); expect(d.inspectScore).toBeLessThanOrEqual(1 + 1e-9); }
    expect(Math.max(...list.map((d) => d.impact.maxZoneRise))).toBeGreaterThan(1);   // some drain matters locally
  });
  it("'assume the likeliest block' blocks exactly k distinct drains, most susceptible first", () => {
    const ids = likeliestBlocked(ds, 14);
    expect(new Set(ids).size).toBe(14);
    const s = new Map(drainStatics(ds).map((d) => [d.id, d.susceptibility]));
    const vals = ids.map((i) => s.get(i)!);
    expect([...vals].sort((a, b) => b - a)).toEqual(vals);
    const overrides = Object.fromEntries(ids.map((i) => [i, "blocked" as const]));
    const r = evaluate(ds, { ...sc, blockageFrac: 0, overrides });
    expect(r.inletOpen.filter((o) => !o).length).toBe(14);
  });
});
