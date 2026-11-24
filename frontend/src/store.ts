import { create } from "zustand";
import type { Dataset, Scenario, ScenarioResult } from "./scenarios/engine/types";
import { BASELINE, evaluate, resolveInletOpen, type PumpSite } from "./scenarios/engine/risk";
import { simData, startSim, seek, stopSim } from "./maps/twin3d/sim/simController";
import type { Lang } from "./components/i18n/i18n";
import { graphFor, type LiveStats } from "./maps/twin3d/sim/liveStats";
import { facilityNode, shortestPath } from "./scenarios/engine/routing";
import { likeliestBlocked } from "./scenarios/engine/drains";

export type RightTab = "overview" | "zone" | "priority" | "drains" | "routes" | "assistant" | "data";
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
};

type Result = ScenarioResult & { pumpSites: PumpSite[] };

interface State {
  ds: Dataset | null;
  error: string | null;
  lang: Lang;
  scenario: Scenario;
  baseline: Result | null;
  result: Result | null;
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
  init(ds: Dataset): void;
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

export const useStore = create<State>((set, get) => ({
  ds: null, error: null, lang: "en", scenario: DEFAULT_SCENARIO, baseline: null, result: null,
  selectedZoneId: null, selectedInletId: null, tab: "overview", view: "3d",
  layers: { risk: "off", peak: false, trees: true, buildings: true, roads: true, drains: true, facilities: true, water: true, rain: true, pumps: true, drainRisk: false },
  playing: true, speed: 600, routeFrom: null, routeTo: null, routeThreshold: 0.25, apiOnline: null, simRunKey: 0, live: null,
  setLive: (live) => set({ live }),

  init(ds) {
    const baseline = evaluate(ds, BASELINE);
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
    set({ ds, baseline, result, routeFrom, routeTo });
    get().restart();
  },
  setLang: (lang) => set({ lang }),

  patchScenario(p) {
    const ds = get().ds; if (!ds) return;
    const scenario = { ...get().scenario, ...p };
    set({ scenario, result: evaluate(ds, scenario) });
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
    const { ds, result, scenario } = get(); if (!ds || !result) return;
    const nx = ds.grid.nx;
    const pumpCells = result.pumpSites.map((p) => Math.min(ds.grid.ny - 1, Math.floor(p.y / ds.grid.cell_m)) * nx + Math.min(nx - 1, Math.floor(p.x / ds.grid.cell_m)));
    startSim(ds, result.inletOpen, pumpCells, scenario.rainfallMm, scenario.durationH);
    seek(0);
    set({ playing: true, simRunKey: get().simRunKey + 1 });
    simData.playing = true;
  },
}));

export function disposeSim() { stopSim(); }
