// Measures the real numbers quoted in the narration from the running app (deterministic).
import { launch, runScenario } from "./common.mjs";
import fs from "node:fs";
const { browser, page } = await launch(1920, 1080);
const SC = {
  base: { name: "Baseline", rainfallMm: 30, durationH: 6, blockageFrac: 0 },
  A: { name: "200 mm in 4 h, half the drains blocked", rainfallMm: 200, durationH: 4, blockageFrac: 0.5 },
  A0: { name: "A, no blockage", rainfallMm: 200, durationH: 4, blockageFrac: 0 },
  A100: { name: "A, all blocked", rainfallMm: 200, durationH: 4, blockageFrac: 1 },
  Ap: { name: "A with pumps", rainfallMm: 200, durationH: 4, blockageFrac: 0.5, pumps: true },
};
const out = { scenarios: {} };
for (const [k, sc] of Object.entries(SC)) {
  await runScenario(page, sc);
  out.scenarios[k] = await page.evaluate((times) => {
    const st = window.__prithvi.getState(), ds = st.ds, res = st.result, base = st.baseline, S = window.SIM;
    const snaps = S.simData.snaps, last = snaps[snaps.length - 1];
    let pk = 0, ha = 0; for (const v of last.peak) { if (v > pk) pk = v; if (v >= 150) ha++; }
    const peakF = Float32Array.from(last.peak, (v) => v / 1000);
    const live = window.LIVE.computeLive(ds, peakF, last.stats, 0.25);
    const exp = window.RISK.exposureSummary(ds, res);
    const timeline = times.map((t) => { const s = snaps[Math.min(snaps.length - 1, Math.round(t / 120))]; return { t, ha: +(s.stats.floodedCells * 156.25 / 1e4).toFixed(1), maxDepth: +s.stats.maxDepth.toFixed(2) }; });
    const order = ["lower", "moderate", "higher", "highest"];
    return { meanIndex: +res.meanIndex.toFixed(1), baseMean: +base.meanIndex.toFixed(1), bands: res.bandCounts, baseBands: base.bandCounts,
      peakHa: +(ha * 156.25 / 1e4).toFixed(1), peakDepth: +(pk / 1000).toFixed(2), peakBuildings: live.floodedBuildings, peakFacilities: live.facilitiesAffected,
      totalDrainedK: Math.round(last.stats.drainM3 / 1000), totalOutK: Math.round(last.stats.outfallM3 / 1000), storedEndK: Math.round(last.stats.storedM3 / 1000),
      flaggedZones: exp.flaggedZoneIds.length, flaggedRoadKm: +exp.roadKm.toFixed(1), flaggedFacilities: exp.facilities.map((f) => f.name), timeline,
      zonesMovedUp: res.zones.filter((z, i) => order.indexOf(z.band) > order.indexOf(base.zones[i].band)).length };
  }, [900, 1800, 3600, 5760, 7200, 9000, 14400, 25200]);
  console.log(k, JSON.stringify({ mean: out.scenarios[k].meanIndex, ha: out.scenarios[k].peakHa, flagged: out.scenarios[k].flaggedZones }));
}
await runScenario(page, SC.A);
out.zone = await page.evaluate(() => { const st = window.__prithvi.getState(), ds = st.ds, res = st.result, base = st.baseline;
  const top = window.RISK.rankPriority(ds, res, 1)[0]; const i = ds.zones.zones.findIndex((z) => z.id === top.zone.id); const z = ds.zones.zones[i], r = res.zones[i], b = base.zones[i];
  return { id: z.id, idx: +r.index.toFixed(1), baseIdx: +b.index.toFixed(1), factors: r.factors, contrib: r.contrib, baseContrib: b.contrib, imperv: Math.round(z.imperv * 100), cap: Math.round(r.drainCapacity * 100), baseCap: Math.round(b.drainCapacity * 100) }; });
out.route = await page.evaluate(() => { const st = window.__prithvi.getState(), ds = st.ds, R = window.ROUTE, S = window.SIM, g = window.LIVE.graphFor(ds);
  const last = S.simData.snaps[S.simData.snaps.length - 1], peak = Float32Array.from(last.peak, (v) => v / 1000);
  const ed = R.edgeDepths(g, peak, ds.grid.nx, ds.grid.ny, ds.grid.cell_m);
  const blockedKm = (thr) => +(g.edges.reduce((s, e, i) => s + (ed[i] >= thr ? e.len : 0), 0) / 1000).toFixed(2);
  return { blockedKm: { 0.1: blockedKm(0.1), 0.25: blockedKm(0.25) } }; });
// story: clear the two drains that serve the top-priority block
out.film = await page.evaluate(() => { const st = window.__prithvi.getState(), ds = st.ds, R = window.RISK;
  const z = ds.zones.zones.find((q) => q.id === "zone_142"); const ids = z.inlets.map(([k]) => ds.inlets[k].id);
  const sum = (res) => { const e = R.exposureSummary(ds, res); return { zone: +res.zones[ds.zones.zones.indexOf(z)].index.toFixed(1), mean: +res.meanIndex.toFixed(1), flagged: e.flaggedZoneIds.length, fac: e.facilities.length }; };
  const ov = {}; ids.forEach((id) => (ov[id] = "cleared"));
  const flaggedFac = R.exposureSummary(ds, st.result).facilities.map((f) => ({ id: f.id, name: f.name, cat: f.category, x: f.x, y: f.y }));
  return { ids, before: sum(st.result), after: sum(R.evaluate(ds, { ...st.scenario, overrides: ov })), flaggedFac }; });
console.log("zone", JSON.stringify(out.zone.idx), "film", JSON.stringify({ ids: out.film.ids, before: out.film.before, after: out.film.after }));
fs.writeFileSync("measures.json", JSON.stringify(out, null, 1));
await browser.close();
