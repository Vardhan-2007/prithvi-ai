// Runs the browser flood solver once for the BASELINE scenario (30 mm / 6 h, all drains open, no pumps, 3 h tail - the same
// run the app does) and writes the per-zone simulated-water factor W, so the FINAL baseline index is available instantly in
// the app and the API.  Run after changing the solver, the dataset or zoneWater():  npx vite-node scripts/export-baseline-water.ts
import { readFileSync, writeFileSync } from "node:fs";
import { buildSolverInit, FloodSolver, DT } from "../src/maps/twin3d/sim/floodSolver";
import { BASELINE, evaluate, zoneWater } from "../src/scenarios/engine/risk";
import type { Dataset } from "../src/scenarios/engine/types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const res = evaluate(ds, BASELINE);
const s = new FloodSolver(buildSolverInit(ds, res.inletOpen, [], BASELINE.rainfallMm, BASELINE.durationH, 3));
const n = Math.round(s.totalSeconds / DT);
for (let i = 0; i < n; i++) s.step(DT);
// the app sees peaks through Uint16 millimetre snapshots: round the same way so app and file agree exactly
const peakMm = Array.from(s.peak, (v) => Math.min(65535, Math.round(v * 1000)) / 1000);
const water = zoneWater(ds, peakMm).map((v) => Math.round(v * 1e6) / 1e6);
const out = {
  note: "Simulated-water factor W per zone for the baseline scenario. Written by frontend/scripts/export-baseline-water.ts - do not edit by hand.",
  scenario: { rainfall_mm: BASELINE.rainfallMm, duration_h: BASELINE.durationH, blockage_fraction: 0, pumps: false, tail_h: 3 },
  water,
};
const json = JSON.stringify(out) + "\n";
writeFileSync(new URL("../public/data/baseline_water.json", import.meta.url), json);
writeFileSync(new URL("../../data/processed/baseline_water.json", import.meta.url), json);
console.log(`baseline W: ${water.filter((v) => v > 0).length} of ${water.length} zones wet, max ${Math.max(...water).toFixed(3)}`);
