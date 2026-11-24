// Behaviour of the browser risk engine. These tests check properties (bounds, monotonicity, consistency), not exact
// scores, so they stay valid if the weights or constants are re-tuned. Exact agreement with the Python engine is
// covered separately by ai-engine/risk_scoring/tests/test_parity.py.
import { describe, expect, it } from "vitest";
import { zoneIdAt } from "./dataset";
import {
  BASELINE, BAND_THRESHOLDS, PUMP_COUNT, WEIGHTS, bandOf, choosePumpSites, delta, evaluate, exposureSummary, indexColor,
  inletOrder, isFlagged, rainfallFactor, rankPriority, resolveInletOpen,
} from "./risk";
import { loadTestDataset } from "./testUtils";
import type { Scenario } from "./types";

const ds = loadTestDataset();
const scn = (o: Partial<Scenario> = {}): Scenario => ({ ...BASELINE, ...o });
const indices = (o: Partial<Scenario>) => evaluate(ds, scn(o)).zones.map((z) => z.index);

describe("constants", () => {
  it("weights sum to one", () => {
    expect(Object.values(WEIGHTS).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 12);
  });

  it("bands start at the documented thresholds", () => {
    const t = BAND_THRESHOLDS;
    expect([0, t.moderate - 0.001, t.moderate, t.higher - 0.001, t.higher, t.highest - 0.001, t.highest, 100].map(bandOf)).toEqual(
      ["lower", "lower", "moderate", "moderate", "higher", "higher", "highest", "highest"]);
  });
});

describe("rainfallFactor", () => {
  it("stays within 0..1 and reports intensity", () => {
    for (const [mm, h] of [[1, 72], [30, 6], [100, 1], [600, 0.25], [600, 0.01]] as const) {
      const { r, intensity } = rainfallFactor(mm, h);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(intensity).toBeCloseTo(mm / Math.max(0.25, h), 9);
    }
  });

  it("never decreases when there is more rain or the same rain falls faster", () => {
    let prev = -1;
    for (const mm of [5, 20, 60, 120, 250, 400, 600]) {
      const { r } = rainfallFactor(mm, 6);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    prev = -1;
    for (const h of [24, 12, 6, 3, 1, 0.5, 0.25]) {
      const { r } = rainfallFactor(100, h);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it("treats durations below 15 minutes as 15 minutes", () => {
    expect(rainfallFactor(100, 0.01)).toEqual(rainfallFactor(100, 0.25));
  });
});

describe("inlet blocking", () => {
  const n = ds.inlets.length;

  it("inletOrder is a deterministic permutation", () => {
    const o = inletOrder(n);
    expect([...o].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    expect(inletOrder(n)).toEqual(o);
  });

  it("blocks round(fraction * n) inlets and the blocked sets are nested", () => {
    let prevClosed = new Set<number>();
    for (const f of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
      const open = resolveInletOpen(ds, scn({ blockageFrac: f }));
      const closed = new Set(open.flatMap((o, i) => (o ? [] : [i])));
      expect(closed.size).toBe(Math.round(f * n));
      for (const i of prevClosed) expect(closed.has(i)).toBe(true);
      prevClosed = closed;
    }
  });

  it("clamps out-of-range fractions", () => {
    expect(resolveInletOpen(ds, scn({ blockageFrac: -1 })).every(Boolean)).toBe(true);
    expect(resolveInletOpen(ds, scn({ blockageFrac: 9 })).some(Boolean)).toBe(false);
  });

  it("manual overrides beat the automatic blockage", () => {
    const [a, b] = [ds.inlets[0].id, ds.inlets[1].id];
    const open = resolveInletOpen(ds, scn({ blockageFrac: 1, overrides: { [a]: "cleared" } }));
    expect(open[0]).toBe(true);
    expect(open[1]).toBe(false);
    const open2 = resolveInletOpen(ds, scn({ blockageFrac: 0, overrides: { [b]: "blocked" } }));
    expect(open2[1]).toBe(false);
    expect(open2[0]).toBe(true);
  });
});

describe("evaluate", () => {
  it("keeps every score in 0..100 and the breakdown adds up to the score", () => {
    for (const o of [{}, { rainfallMm: 600, durationH: 0.25, blockageFrac: 1 }, { rainfallMm: 1, durationH: 72 }, { pumps: true, rainfallMm: 200 }]) {
      const res = evaluate(ds, scn(o));
      expect(res.zones).toHaveLength(ds.zones.zones.length);
      for (const z of res.zones) {
        expect(z.index).toBeGreaterThanOrEqual(0);
        expect(z.index).toBeLessThanOrEqual(100);
        expect(z.contrib.terrain + z.contrib.rainfall + z.contrib.drainage + z.contrib.exposure).toBeCloseTo(z.index, 9);
        for (const k of ["terrain", "rainfall", "drainage", "exposure"] as const) {
          expect(z.factors[k]).toBeGreaterThanOrEqual(0);
          expect(z.factors[k]).toBeLessThanOrEqual(1);
        }
        expect(bandOf(z.index)).toBe(z.band);
        expect(z.openInlets).toBeLessThanOrEqual(z.totalInlets);
      }
    }
  });

  it("band counts add up to the number of zones and the mean matches", () => {
    const res = evaluate(ds, scn({ rainfallMm: 150, blockageFrac: 0.3 }));
    expect(Object.values(res.bandCounts).reduce((s, c) => s + c, 0)).toBe(res.zones.length);
    expect(res.meanIndex).toBeCloseTo(res.zones.reduce((s, z) => s + z.index, 0) / res.zones.length, 9);
  });

  it("is deterministic", () => {
    expect(indices({ rainfallMm: 120, blockageFrac: 0.4 })).toEqual(indices({ rainfallMm: 120, blockageFrac: 0.4 }));
  });

  it("more rain never lowers any zone's score", () => {
    let prev: number[] | null = null;
    for (const mm of [20, 60, 120, 200, 320, 500]) {
      const cur = indices({ rainfallMm: mm });
      if (prev) cur.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(prev![i] - 1e-9));
      prev = cur;
    }
  });

  it("more blocked drains never lowers a zone's drainage factor", () => {
    let prev: number[] | null = null;
    for (const f of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const cur = evaluate(ds, scn({ blockageFrac: f })).zones.map((z) => z.factors.drainage);
      if (prev) cur.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(prev![i] - 1e-9));
      prev = cur;
    }
  });

  it("pumps never raise a zone's score and are well spaced", () => {
    const sc = scn({ rainfallMm: 200, blockageFrac: 0.5 });
    const without = evaluate(ds, sc);
    const withPumps = evaluate(ds, { ...sc, pumps: true });
    delta(withPumps, without).forEach((d) => expect(d).toBeLessThanOrEqual(1e-9));
    expect(withPumps.pumpSites.length).toBeGreaterThan(0);
    expect(withPumps.pumpSites.length).toBeLessThanOrEqual(PUMP_COUNT);
    expect(without.pumpSites).toEqual([]);
    const s = withPumps.pumpSites;
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) expect(Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y)).toBeGreaterThanOrEqual(150);
  });

  it("chooses pump sites without looking at the pumped result", () => {
    const sc = scn({ rainfallMm: 200 });
    expect(choosePumpSites(ds, evaluate(ds, sc))).toEqual(evaluate(ds, { ...sc, pumps: true }).pumpSites);
  });
});

describe("exposure and priority", () => {
  const heavy = evaluate(ds, scn({ rainfallMm: 600, durationH: 0.25, blockageFrac: 0.5 }));

  it("flags exactly the higher and highest zones", () => {
    const summary = exposureSummary(ds, heavy);
    expect(summary.flaggedZoneIds.length).toBeGreaterThan(0);
    expect(new Set(summary.flaggedZoneIds)).toEqual(new Set(heavy.zones.filter(isFlagged).map((z) => z.id)));
  });

  it("only lists roads and facilities that lie in flagged zones", () => {
    const summary = exposureSummary(ds, heavy);
    const flagged = new Set(summary.flaggedZoneIds);
    for (const f of summary.facilities) expect(flagged.has(zoneIdAt(ds, f.x, f.y)!)).toBe(true);
    for (const r of summary.roads) expect(r.lengthM).toBeGreaterThan(0);
    expect(summary.roadKm).toBeCloseTo(summary.roads.reduce((s, r) => s + r.lengthM, 0) / 1000, 9);
    const lens = summary.roads.map((r) => r.lengthM);
    expect(lens).toEqual([...lens].sort((a, b) => b - a));
  });

  it("reports nothing when no zone is flagged", () => {
    const calm = evaluate(ds, scn({ rainfallMm: 1, durationH: 72 }));
    expect(calm.zones.some(isFlagged)).toBe(false);
    const s = exposureSummary(ds, calm);
    expect(s.flaggedZoneIds).toEqual([]);
    expect(s.roads).toEqual([]);
    expect(s.facilities).toEqual([]);
    expect(s.roadKm).toBe(0);
  });

  it("ranks priority from highest to lowest and never calls rainfall the driver", () => {
    const top = rankPriority(ds, heavy, 10);
    expect(top).toHaveLength(10);
    const p = top.map((t) => t.priority);
    expect(p).toEqual([...p].sort((a, b) => b - a));
    for (const t of top) expect(t.topFactor).not.toBe("rainfall");
    expect(rankPriority(ds, heavy, 3)).toHaveLength(3);
  });
});

describe("indexColor", () => {
  it("returns valid colour channels over the whole range and clamps above 100", () => {
    for (let v = -10; v <= 120; v += 2.5) for (const c of indexColor(v)) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    expect(indexColor(150)).toEqual(indexColor(100));
  });

  it("changes smoothly (no jumps between neighbouring scores)", () => {
    for (let v = 0; v < 100; v += 0.5) {
      const a = indexColor(v), b = indexColor(v + 0.5);
      for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.1);
    }
  });
});
