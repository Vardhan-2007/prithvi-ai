// How well does the zone score agree with the flood simulation? Prints, for a few scenarios, the PROVISIONAL score
// (original formula) and the FINAL score (with simulated water W) against the simulated wetness of each zone.
// Run: npx vite-node scripts/agreement-report.ts
import { readFileSync } from "node:fs";
import { buildSolverInit, FloodSolver, DT } from "../src/maps/twin3d/sim/floodSolver";
import { BASELINE, evaluate, zoneWater } from "../src/scenarios/engine/risk";
import type { Dataset, ScenarioResult } from "../src/scenarios/engine/types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));

function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length).fill(0);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a), rb = ranks(b), n = a.length, ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}
const topK = (v: number[], k: number) => new Set(v.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]).slice(0, k).map((p) => p[1]));
function report(label: string, r: ScenarioResult, w: number[]) {
  const idx = r.zones.map((z) => z.index);
  const flagged = r.zones.map((z) => z.band === "higher" || z.band === "highest");
  const dry = flagged.filter((f, i) => f && w[i] < 0.1).length;
  const a = topK(idx, 20), b = topK(w, 20);
  const overlap = [...a].filter((i) => b.has(i)).length;
  console.log(`  ${label.padEnd(11)} spearman ${spearman(idx, w).toFixed(2)} | top-20 overlap ${String(overlap).padStart(2)}/20 | flagged ${String(flagged.filter(Boolean).length).padStart(3)}, of which nearly dry (W<0.1) ${dry}`);
}

const cases: [number, number, number][] = [[100, 6, 0.25], [200, 4, 0.5], [300, 4, 0.75]];
for (const [mm, h, b] of cases) {
  const sc = { ...BASELINE, rainfallMm: mm, durationH: h, blockageFrac: b };
  const prov = evaluate(ds, sc);
  const s = new FloodSolver(buildSolverInit(ds, prov.inletOpen, [], mm, h, 3));
  for (let i = 0; i < s.totalSeconds / DT; i++) s.step(DT);
  const w = zoneWater(ds, s.peak);
  console.log(`${mm} mm / ${h} h, ${b * 100}% blocked:`);
  report("provisional", prov, w);
  report("final", evaluate(ds, sc, { water: w }), w);
}
