import { create } from "zustand";
import type { Dataset, Scenario, ScenarioResult } from "./scenarios/engine/types";
import { BASELINE, evaluate, resolveInletOpen, zoneWater, type PumpSite } from "./scenarios/engine/risk";
import { simData, startSim, seek, stopSim, scenarioStorm, onSimUpdate, peakAtPlayhead } from "./maps/twin3d/sim/simController";
import type { Lang } from "./components/i18n/i18n";
import { getForecast, type CaseKey, type ForecastHours, type ForecastResult } from "./scenarios/engine/forecast";
import { stepStorm, type StepStorm } from "./maps/twin3d/sim/storm";
import { graphFor, type LiveStats } from "./maps/twin3d/sim/liveStats";
import { facilityNode, shortestPath } from "./scenarios/engine/routing";
import { likeliestBlocked } from "./scenarios/engine/drains";
import { getConditions, type ConditionsResult } from "./scenarios/engine/conditions";

export type RightTab = "overview" | "zone" | "priority" | "drains" | "routes" | "replay" | "assistant" | "data";
export type MainView = "3d" | "map" | "compare";
export type RiskLayer = "off" | "index" | "delta";

export interface Layers {
  risk: RiskLayer; peak: boolean; trees: boolean; buildings: boolean; roads: boolean; drains: boolean; facilities: boolean; water: boolean; rain: boolean; pumps: boolean;
  drainRisk: boolean;   // colour drains by how likely they are to block (set while the Drains tab is open)
}

export const PRESETS: { id: string; rainfallMm: number; durationH: number; blockageFrac: number }[] = [
  { id: "light", rainfallMm: 40, durationH: 6, blockageFrac: 0 },
  { id: "heavy", rainfallMm: 100, durationH: 6, blockageFrac: 0.25 },
  { id: "veryHeavy", rainfallMm: 180, durationH: 6, blockageFrac: 0.4 },
  { id: "extreme", rainfallMm: 300, durationH: 4, blockageFrac: 0.6 },
];

export const DEFAULT_SCENARIO: Scenario = {
  name: "High rainfall + partial drainage blockage", rainfallMm: 100, durationH: 6, blockageFrac: 0.25, overrides: {}, pumps: false,
  soilWetness: 0, seaLevelM: 0,
};

type Result = ScenarioResult & { pumpSites: PumpSite[] };

/** Live mode: the scenario's rain comes from the latest ensemble forecast instead of the sliders. */
export interface LiveMode {
  on: boolean;
  hours: ForecastHours;
  status: "idle" | "loading" | "ok" | "error";
  forecast: ForecastResult | null;
  caseKey: CaseKey;
  error: string | null;
}

/** Ground wetness and sea level loaded from Open-Meteo (for now, or for a replayed day). */
export interface ConditionsState {
  status: "idle" | "loading" | "ok" | "error";
  date: string | null;          // null = now / the forecast window
  data: ConditionsResult | null;
}

interface State {
  ds: Dataset | null;
  error: string | null;
  lang: Lang;
  scenario: Scenario;
  baseline: Result | null;          // the baseline at the same stage as `result` (provisional or final)
  baselineProvisional: Result | null;
  baselineFinal: Result | null;     // needs data/baseline_water.json
  result: Result | null;            // provisional while the flood run is going, final (with W) once it finishes
  selectedZoneId: string | null;
  selectedInletId: string | null;
  tab: RightTab;
  view: MainView;
  layers: Layers;
  playing: boolean;
  speed: number;
  routeFrom: string | null; routeTo: string | null; routeThreshold: number;
  apiOnline: boolean | null;
  simRunKey: number;
  live: LiveStats | null;
  setLive(l: LiveStats): void;
  liveMode: LiveMode;
  setLiveOn(on: boolean): void;
  setLiveHours(h: ForecastHours): void;
  setLiveCase(c: CaseKey): void;
  refreshForecast(): Promise<void>;
  runStorm(storm: StepStorm, name: string): void;
  conditions: ConditionsState;
  loadConditions(date?: string): Promise<void>;
  init(ds: Dataset, baselineWater?: number[] | null): void;
  finalizeFromSim(): void;
  setLang(l: Lang): void;
  patchScenario(p: Partial<Scenario>): void;
  applyScenario(p: Partial<Scenario>, opts?: { restart?: boolean }): void;
  toggleInlet(id: string): void;
  clearOverrides(): void;
  selectZone(id: string | null, openTab?: boolean): void;
  setSelectedInlet(id: string | null): void;
  assumeLikeliestBlocked(k: number): void;
  setTab(t: RightTab): void;
  setView(v: MainView): void;
  setLayers(p: Partial<Layers>): void;
  setPlaying(b: boolean): void;
  setSpeed(s: number): void;
  setRoute(p: { routeFrom?: string | null; routeTo?: string | null; routeThreshold?: number }): void;
  setApiOnline(b: boolean): void;
  restart(): void;
}

let unsubFinal: (() => void) | null = null;
let pendingRun = -1;    // sim run whose finish should finalize the score
let finalizedRun = -1;

export const useStore = create<State>((set, get) => ({
  ds: null, error: null, lang: "en", scenario: DEFAULT_SCENARIO, baseline: null, baselineProvisional: null, baselineFinal: null, result: null,
  selectedZoneId: null, selectedInletId: null, tab: "overview", view: "3d",
  layers: { risk: "off", peak: false, trees: true, buildings: true, roads: true, drains: true, facilities: true, water: true, rain: true, pumps: true, drainRisk: false },
  playing: true, speed: 600, routeFrom: null, routeTo: null, routeThreshold: 0.25, apiOnline: null, simRunKey: 0, live: null,
  setLive: (live) => set({ live }),
  liveMode: { on: false, hours: 24, status: "idle", forecast: null, caseKey: "likely", error: null },
  conditions: { status: "idle", date: null, data: null },

  /** Fill ground wetness and sea level from Open-Meteo, then rerun. Values that could not be loaded are left as they are. */
  async loadConditions(date) {
    const ds = get().ds; if (!ds) return;
    set({ conditions: { status: "loading", date: date ?? null, data: get().conditions.data } });
    const [w, s, e, n] = ds.meta.bbox;
    const data = await getConditions((s + n) / 2, (w + e) / 2, { date, hours: get().liveMode.hours });
    if ((get().conditions.date ?? null) !== (date ?? null)) return;   // a newer request replaced this one
    const p: Partial<Scenario> = {};
    // For a replayed day, a value that could not be loaded falls back to neutral (0) rather than keeping today's value.
    if (data.soilWetness !== null) p.soilWetness = data.soilWetness; else if (date) p.soilWetness = 0;
    if (data.seaLevelM !== null) p.seaLevelM = Math.max(0, data.seaLevelM); else if (date) p.seaLevelM = 0;
    set({ conditions: { status: data.soilWetness === null && data.seaLevelM === null ? "error" : "ok", date: date ?? null, data } });
    if (Object.keys(p).length) get().applyScenario(p);
  },

  setLiveOn(on) {
    set({ liveMode: { ...get().liveMode, on } });
    if (on) void get().refreshForecast();
    else get().applyScenario({ ...DEFAULT_SCENARIO });   // back to what-if mode (drops the forecast storm)
  },
  setLiveHours(hours) {
    set({ liveMode: { ...get().liveMode, hours } });
    if (get().liveMode.on) void get().refreshForecast();
  },
  setLiveCase(caseKey) {
    set({ liveMode: { ...get().liveMode, caseKey } });
    const f = get().liveMode.forecast;
    if (!get().liveMode.on || !f) return;
    const c = f.data.cases[caseKey];
    get().applyScenario({
      name: `Live forecast · ${caseKey} · ${c.total_mm} mm / ${f.data.hours} h`,
      storm: stepStorm(c.hyetograph_mm, 1, { startIso: f.data.start_utc + "Z", label: `${f.data.source.name}, ${caseKey} member` }),
    });
  },
  /** Run an explicit hour-by-hour storm (e.g. a replayed day). Leaves Live mode without resetting the scenario. */
  runStorm(storm, name) {
    if (get().liveMode.on) set({ liveMode: { ...get().liveMode, on: false } });
    get().applyScenario({ name, storm });
  },
  async refreshForecast() {
    const { ds, liveMode } = get(); if (!ds) return;
    set({ liveMode: { ...liveMode, status: "loading", error: null } });
    const [w, s, e, n] = ds.meta.bbox;
    try {
      const forecast = await getForecast((s + n) / 2, (w + e) / 2, liveMode.hours);
      if (!get().liveMode.on) return;   // switched off while loading
      set({ liveMode: { ...get().liveMode, status: "ok", forecast, error: null } });
      get().setLiveCase(get().liveMode.caseKey);
      void get().loadConditions();
    } catch (err) {
      set({ liveMode: { ...get().liveMode, status: "error", error: err instanceof Error ? err.message : String(err) } });
    }
  },

  init(ds, baselineWater) {
    const baseline = evaluate(ds, BASELINE);
    let baselineFinal: Result | null = null;
    if (baselineWater && baselineWater.length === ds.zones.zones.length) baselineFinal = evaluate(ds, BASELINE, { water: baselineWater });
    const result = evaluate(ds, get().scenario);
    // default route demo: the farthest-apart connected (health -> emergency/shelter) pair
    const g = graphFor(ds);
    const from = ds.facilities.filter((f) => f.category === "health");
    const to = ds.facilities.filter((f) => f.category === "emergency" || f.category === "shelter");
    const pairs = from.flatMap((a) => to.map((b) => ({ a, b, d: Math.hypot(a.x - b.x, a.y - b.y) }))).sort((p, q) => q.d - p.d).slice(0, 12);
    let routeFrom: string | null = from[0]?.id ?? null, routeTo: string | null = to[0]?.id ?? null;
    for (const p of pairs) {
      const na = facilityNode(g, p.a), nb = facilityNode(g, p.b);
      if (na && nb && shortestPath(g, na, nb).found) { routeFrom = p.a.id; routeTo = p.b.id; break; }
    }
    set({ ds, baseline, baselineProvisional: baseline, baselineFinal, result, routeFrom, routeTo });
    if (!unsubFinal) unsubFinal = onSimUpdate(() => { if (simData.done) get().finalizeFromSim(); });
    get().restart();
  },
  setLang: (lang) => set({ lang }),

  patchScenario(p) {
    const ds = get().ds; if (!ds) return;
    const scenario: Scenario = { ...get().scenario, ...p };
    // Moving the rain or duration sliders leaves forecast / replay mode: drop the hyetograph.
    if (!("storm" in p) && ("rainfallMm" in p || "durationH" in p)) {
      delete scenario.storm;
      if (get().liveMode.on) set({ liveMode: { ...get().liveMode, on: false } });   // manual rain = what-if mode
    }
    // A hyetograph fixes the total depth and duration used by the risk index.
    if (scenario.storm) {
      scenario.rainfallMm = Math.round(scenario.storm.mm.reduce((a, b) => a + b, 0) * 10) / 10;
      scenario.durationH = scenario.storm.mm.length * scenario.storm.stepH;
    }
    pendingRun = -1; // the running simulation no longer matches the scenario: never finalize from it
    set({ scenario, result: evaluate(ds, scenario), baseline: get().baselineProvisional });
  },
  /** When the current flood run has finished, rescore with the simulated-water factor W (FINAL stage). */
  finalizeFromSim() {
    const { ds, scenario, result } = get();
    if (!ds || !result || result.stage === "final" || !simData.done || finalizedRun === simData.runId || pendingRun !== simData.runId) return;
    const peak = new Float32Array(ds.grid.nx * ds.grid.ny);
    if (!peakAtPlayhead(peak, true)) return;
    finalizedRun = simData.runId;
    const final = evaluate(ds, scenario, { water: zoneWater(ds, peak) });
    const { baselineFinal, baselineProvisional } = get();
    set({ result: final, baseline: baselineFinal ?? baselineProvisional });
  },
  applyScenario(p, opts) {
    get().patchScenario(p);
    if (opts?.restart !== false) get().restart();
  },
  toggleInlet(id) {
    const ds = get().ds, sc = get().scenario; if (!ds) return;
    const idx = ds.inlets.findIndex((i) => i.id === id);
    const open = get().result!.inletOpen[idx];
    const overrides = { ...sc.overrides };
    delete overrides[id];
    const autoOpen = resolveInletOpen(ds, { ...sc, overrides })[idx]; // state without a manual override
    const want = !open;
    if (want !== autoOpen) overrides[id] = want ? "cleared" : "blocked";
    get().patchScenario({ overrides });
    get().restart();
  },
  setSelectedInlet(id) { set({ selectedInletId: id }); },
  /** replace the random blockage pattern by "the k drains most likely to block (indicative)" */
  assumeLikeliestBlocked(k) {
    const ds = get().ds; if (!ds) return;
    const overrides: Record<string, "blocked"> = Object.fromEntries(likeliestBlocked(ds, k).map((id) => [id, "blocked" as const]));
    get().patchScenario({ blockageFrac: 0, overrides });
    get().restart();
  },
  clearOverrides() { get().applyScenario({ overrides: {}, blockageFrac: 0 }); },

  selectZone(id, openTab = true) { set({ selectedZoneId: id, ...(id && openTab ? { tab: "zone" as RightTab } : {}) }); },
  setTab: (tab) => set({ tab }),
  setView: (view) => set({ view }),
  setLayers: (p) => set({ layers: { ...get().layers, ...p } }),
  setPlaying(b) { simData.playing = b; set({ playing: b }); },
  setSpeed(s) { simData.speed = s; set({ speed: s }); },
  setRoute: (p) => set(p as Partial<State>),
  setApiOnline: (b) => set({ apiOnline: b }),

  restart() {
    const { ds, scenario } = get(); if (!ds || !get().result) return;
    // a new run always starts from the provisional score of the CURRENT scenario
    const result = evaluate(ds, scenario);
    set({ result, baseline: get().baselineProvisional });
    const nx = ds.grid.nx;
    const pumpCells = result.pumpSites.map((p) => Math.min(ds.grid.ny - 1, Math.floor(p.y / ds.grid.cell_m)) * nx + Math.min(nx - 1, Math.floor(p.x / ds.grid.cell_m)));
    startSim(ds, result.inletOpen, pumpCells, scenarioStorm(scenario), { conditions: { soilWetness: scenario.soilWetness ?? 0, seaLevelM: scenario.seaLevelM ?? 0 } });
    pendingRun = simData.runId;
    seek(0);
    set({ playing: true, simRunKey: get().simRunKey + 1 });
    simData.playing = true;
  },
}));

export function disposeSim() { stopSim(); }
