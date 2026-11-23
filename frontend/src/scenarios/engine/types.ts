// Dataset + scenario types shared by every feature. Mirrors docs/contracts/*.schema.json.

export type DataStatus = "observed" | "derived" | "proxy" | "simulated";

export interface LayerMeta {
  id: string;
  title: string;
  source_name: string;
  source_url: string;
  retrieved_at: string;
  licence_or_terms: string;
  native_resolution_or_scale: string;
  processing_method: string;
  data_status: DataStatus;
  known_limitations: string;
}

export interface Building { id: string; h: number; h_src: string; ring: [number, number][] }
export interface Road {
  id: string; cls: string; name: string | null; width: number; oneway: boolean;
  nodes: string[]; pts: [number, number][];
}
export interface Facility {
  id: string; amenity: string; category: "health" | "emergency" | "shelter" | "other";
  name: string; x: number; y: number;
}
export interface Inlet { id: string; x: number; y: number; ix: number; iy: number; elev: number; status: string }
export interface Water { id: string; ring: [number, number][] }

export interface Zone {
  id: string; ix: number; iy: number; cx: number; cy: number;
  mean_elev: number; terrain: number; imperv: number; exposure: number;
  n_buildings: number; road_m: number;
  facilities: { health: number; emergency: number; shelter: number };
  inlets: [number, number][]; // [inletIndex, weight]
}

export interface Dataset {
  meta: {
    area_id: string; name: string; generated_at: string;
    origin: { lon: number; lat: number }; bbox: [number, number, number, number];
    size_m: [number, number]; m_per_deg: { lon: number; lat: number }; statement: string;
  };
  grid: { nx: number; ny: number; cell_m: number; dem: number[]; building_mask: number[]; road_mask: number[] };
  buildings: Building[];
  roads: Road[];
  road_nodes: Record<string, [number, number]>;
  facilities: Facility[];
  water: Water[];
  inlets: Inlet[];
  zones: { nx: number; ny: number; size_m: number; wref: number; zones: Zone[] };
  layers: LayerMeta[];
}

import type { StepStorm } from "../../maps/twin3d/sim/storm";

export type InletOverride = "blocked" | "cleared";

export interface Scenario {
  name: string;
  rainfallMm: number;       // total depth
  durationH: number;
  blockageFrac: number;     // 0..1 of inlets assumed unavailable (deterministic order)
  overrides: Record<string, InletOverride>; // per-inlet manual state
  pumps: boolean;           // mitigation: temporary pumps at top-priority zones
  // Optional step hyetograph (forecast / replay). When set, rainfallMm and durationH are its total and length,
  // and the flood solver uses the hour-by-hour shape instead of the triangle.
  storm?: StepStorm;
}

export type Band = "lower" | "moderate" | "higher" | "highest";

export interface ZoneResult {
  id: string;
  index: number;            // 0..100
  band: Band;
  factors: { terrain: number; rainfall: number; drainage: number; exposure: number }; // normalised 0..1
  contrib: { terrain: number; rainfall: number; drainage: number; exposure: number }; // weighted points
  drainCapacity: number;    // 0..1 effective local inlet capacity
  openInlets: number;
  totalInlets: number;
}

export interface ScenarioResult {
  scenario: Scenario;
  rainfallFactor: number;
  intensityMmH: number;
  zones: ZoneResult[];
  meanIndex: number;
  bandCounts: Record<Band, number>;
  inletOpen: boolean[];
}
