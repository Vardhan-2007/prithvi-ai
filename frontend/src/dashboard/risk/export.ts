import type { Dataset, ScenarioResult } from "../../scenarios/engine/types";

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const NOTE = "PRITHVI AI is an experimental planning and visualisation prototype. Scenario scores are indicative indices based on the selected data and assumptions. They are not official forecasts, flood-depth estimates, evacuation instructions or a substitute for local authorities.";

export function exportCsv(ds: Dataset, res: ScenarioResult, base: ScenarioResult) {
  const sc = res.scenario;
  const head = [`# ${NOTE}`, `# scenario: ${sc.name}; rainfall_mm=${sc.rainfallMm}; duration_h=${sc.durationH}; blockage_fraction=${sc.blockageFrac}; pumps=${sc.pumps}; manual_inlet_overrides=${JSON.stringify(sc.overrides)}`,
    `# data_status: simulated_scenario (rainfall + drainage are assumptions); terrain/facilities derived from Copernicus GLO-90 and OpenStreetMap (c) contributors, ODbL`,
    "zone_id,band,risk_index,baseline_index,delta,terrain,rainfall,drainage,exposure,open_inlets,total_inlets,buildings,road_m,health,emergency,shelter"];
  const rows = res.zones.map((z, i) => {
    const zz = ds.zones.zones[i];
    return [z.id, z.band, z.index.toFixed(2), base.zones[i].index.toFixed(2), (z.index - base.zones[i].index).toFixed(2),
      z.factors.terrain.toFixed(3), z.factors.rainfall.toFixed(3), z.factors.drainage.toFixed(3), z.factors.exposure.toFixed(3),
      z.openInlets, z.totalInlets, zz.n_buildings, zz.road_m, zz.facilities.health, zz.facilities.emergency, zz.facilities.shelter].join(",");
  });
  download(`prithvi_${ds.meta.area_id}_scenario.csv`, "text/csv", [...head, ...rows].join("\n"));
}

export function exportJson(ds: Dataset, res: ScenarioResult, base: ScenarioResult) {
  download(`prithvi_${ds.meta.area_id}_scenario.json`, "application/json", JSON.stringify({
    status: "simulated_scenario", statement: NOTE, area_id: ds.meta.area_id, scenario: res.scenario,
    summary: { mean_index: res.meanIndex, baseline_mean_index: base.meanIndex, band_counts: res.bandCounts, baseline_band_counts: base.bandCounts },
    assumptions: ["Rainfall input is user-defined", "Drainage inlets are proxy points; blockage is a sensitivity assumption", "Risk index is not a flood probability or depth estimate"],
    zones: res.zones.map((z, i) => ({ zone_id: z.id, risk_index: +z.index.toFixed(2), band: z.band, delta_from_baseline: +(z.index - base.zones[i].index).toFixed(2), factors: z.factors })),
  }, null, 1));
}
