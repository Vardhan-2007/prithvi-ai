// Prints solver + index behaviour for a grid of scenarios (sanity check, no browser needed).
import { readFileSync } from "node:fs";
import { buildSolverInit, FloodSolver, DT, FLOOD_DEPTH_M } from "../src/features/twin3d/sim/floodSolver";
import { evaluate, BASELINE } from "../src/shared/engine/risk";
import type { Dataset } from "../src/shared/engine/types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const cases: [number, number, number][] = [[30, 6, 0], [100, 6, 0], [100, 6, 0.5], [200, 6, 0.5], [300, 4, 0.75]];
for (const [mm, h, b] of cases) {
  const sc = { ...BASELINE, rainfallMm: mm, durationH: h, blockageFrac: b };
  const r = evaluate(ds, sc);
  const s = new FloodSolver(buildSolverInit(ds, r.inletOpen, [], mm, h));
  const t0 = Date.now();
  for (let i = 0; i < s.totalSeconds / DT; i++) s.step(DT);
  let pk = 0, pf = 0; for (const v of s.peak) { if (v > pk) pk = v; if (v >= FLOOD_DEPTH_M) pf++; }
  console.log(`${mm}mm/${h}h block=${b * 100}%  mean idx ${r.meanIndex.toFixed(1)} bands ${JSON.stringify(r.bandCounts)} | peak depth ${pk.toFixed(2)} m, cells>=0.15m ${pf} (${(pf * 156.25 / 1e4).toFixed(1)} ha) | ${(Date.now() - t0)} ms`);
}
