// Writes the browser engine's results for a few scenarios so the Python engine can be checked against them
// (ai-engine/risk_scoring/tests/test_parity.py).  Run: npx vite-node scripts/export-reference.ts
import { readFileSync, writeFileSync } from "node:fs";
import { evaluate, BASELINE, zoneWater } from "../src/scenarios/engine/risk";
import type { Dataset, Scenario } from "../src/scenarios/engine/types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const ids = ds.inlets.map((i) => i.id);
const cases: Scenario[] = [
  BASELINE,
  { ...BASELINE, name: "pack example", rainfallMm: 100, durationH: 6, blockageFrac: 0.25 },
  { ...BASELINE, name: "extreme", rainfallMm: 300, durationH: 4, blockageFrac: 0.6, pumps: true },
  { ...BASELINE, name: "overrides", rainfallMm: 180, durationH: 6, blockageFrac: 0.35, overrides: { [ids[3]]: "cleared", [ids[7]]: "blocked", [ids[11]]: "blocked" } },
  { ...BASELINE, name: "odd rounding", rainfallMm: 75, durationH: 2.5, blockageFrac: 0.1 },
];
// A deterministic synthetic peak-depth grid (metres) so both engines can be checked on the simulated-water factor W
// and the FINAL index without running the flood solver. Values are rounded to whole mm, like the app's snapshots.
const n = ds.grid.nx * ds.grid.ny;
const synthPeak = Array.from({ length: n }, (_, c) => (c % ds.grid.nx < 40 ? 0 : 1) * Math.round(1000 * Math.max(0, 0.45 * Math.sin(c * 0.37) + 0.25 * Math.cos(c * 0.011) - 0.1)) / 1000);
const water = zoneWater(ds, synthPeak);
const row = (sc: Scenario, w?: number[]) => {
  const r = evaluate(ds, sc, w ? { water: w } : undefined);
  return {
    scenario: { name: sc.name + (w ? " [final]" : ""), rainfall_mm: sc.rainfallMm, duration_h: sc.durationH, blockage_fraction: sc.blockageFrac, overrides: sc.overrides, pumps: sc.pumps },
    stage: r.stage, final: !!w,
    mean_index: r.meanIndex, inlet_open: r.inletOpen, band_counts: r.bandCounts, indices: r.zones.map((z) => z.index),
  };
};
const out = {
  synthetic_peak_m: synthPeak,
  water,
  cases: [...cases.map((sc) => row(sc)), ...cases.slice(1, 4).map((sc) => row(sc, water))],
};
writeFileSync(new URL("../../ai-engine/risk_scoring/tests/ts_reference.json", import.meta.url), JSON.stringify(out));
console.log(`wrote ${out.cases.length} reference scenarios (+ W for ${water.length} zones)`);
