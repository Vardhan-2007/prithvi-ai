// Writes the browser engine's results for a few scenarios so the Python engine can be checked against them
// (engines/risk/tests/test_parity.py).  Run: npx vite-node scripts/export-reference.ts
import { readFileSync, writeFileSync } from "node:fs";
import { evaluate, BASELINE } from "../src/shared/engine/risk";
import type { Dataset, Scenario } from "../src/shared/engine/types";

const ds: Dataset = JSON.parse(readFileSync(new URL("../public/data/pilot_kakinada_01.json", import.meta.url), "utf8"));
const ids = ds.inlets.map((i) => i.id);
const cases: Scenario[] = [
  BASELINE,
  { ...BASELINE, name: "pack example", rainfallMm: 100, durationH: 6, blockageFrac: 0.25 },
  { ...BASELINE, name: "extreme", rainfallMm: 300, durationH: 4, blockageFrac: 0.6, pumps: true },
  { ...BASELINE, name: "overrides", rainfallMm: 180, durationH: 6, blockageFrac: 0.35, overrides: { [ids[3]]: "cleared", [ids[7]]: "blocked", [ids[11]]: "blocked" } },
  { ...BASELINE, name: "odd rounding", rainfallMm: 75, durationH: 2.5, blockageFrac: 0.1 },
];
const out = cases.map((sc) => {
  const r = evaluate(ds, sc);
  return {
    scenario: { name: sc.name, rainfall_mm: sc.rainfallMm, duration_h: sc.durationH, blockage_fraction: sc.blockageFrac, overrides: sc.overrides, pumps: sc.pumps },
    mean_index: r.meanIndex, inlet_open: r.inletOpen, band_counts: r.bandCounts, indices: r.zones.map((z) => z.index),
  };
});
writeFileSync(new URL("../../../engines/risk/tests/ts_reference.json", import.meta.url), JSON.stringify(out));
console.log(`wrote ${out.length} reference scenarios`);
