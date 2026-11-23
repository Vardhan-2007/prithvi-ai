// Runs the browser flood solver on a short irregular hyetograph and writes the results so the NumPy solver can be
// checked against it (backend/tests/test_solver_parity.py).  Run: npx vite-node scripts/export-solver-reference.ts
import { readFileSync, writeFileSync } from "node:fs";
import { buildSolverInit, FloodSolver, DT, FLOOD_DEPTH_M } from "../src/maps/twin3d/sim/floodSolver";
import { stepStorm } from "../src/maps/twin3d/sim/storm";
import { evaluate, BASELINE } from "../src/scenarios/engine/risk";
import type { Dataset } from "../src/scenarios/engine/types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const HYETOGRAPH = [6, 28, 3, 14];   // 15-minute steps: burst, lull, smaller burst
const STEP_H = 0.25, TAIL_H = 0.25, BLOCKAGE = 0.25;
const res = evaluate(ds, { ...BASELINE, rainfallMm: 51, durationH: 1, blockageFrac: BLOCKAGE });
const s = new FloodSolver(buildSolverInit(ds, res.inletOpen, [], stepStorm(HYETOGRAPH, STEP_H), 0, TAIL_H));
const n = Math.round(s.totalSeconds / DT);
for (let i = 0; i < n; i++) s.step(DT);
const st = s.stats();
let peakCells = 0, peakMax = 0;
for (const v of s.peak) { if (v >= FLOOD_DEPTH_M) peakCells++; if (v > peakMax) peakMax = v; }
const out = {
  note: "Written by frontend/scripts/export-solver-reference.ts - do not edit by hand",
  hyetograph_mm: HYETOGRAPH, step_h: STEP_H, tail_h: TAIL_H, blockage_fraction: BLOCKAGE,
  stored_m3: st.storedM3, drain_m3: st.drainM3, outfall_m3: st.outfallM3, expected_rain_m3: s.expectedRainM3(),
  peak_flooded_cells: peakCells, peak_max_depth: peakMax,
};
writeFileSync(new URL("../../backend/tests/ts_solver_reference.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(out);
