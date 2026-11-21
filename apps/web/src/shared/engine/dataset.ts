import type { Dataset } from "./types";

export async function loadDataset(): Promise<Dataset> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/pilot_kakinada_01.json`);
  if (!res.ok) throw new Error(`Could not load pilot dataset (${res.status}). Run: python3 pipelines/build_pilot_dataset.py`);
  return (await res.json()) as Dataset;
}

export function cellIndex(ds: Dataset, x: number, y: number): number {
  const { nx, ny, cell_m } = ds.grid;
  const ix = Math.min(nx - 1, Math.max(0, Math.floor(x / cell_m)));
  const iy = Math.min(ny - 1, Math.max(0, Math.floor(y / cell_m)));
  return iy * nx + ix;
}

/** bilinear ground elevation (cell-centred samples) */
export function demAt(ds: Dataset, x: number, y: number): number {
  const { nx, ny, cell_m, dem } = ds.grid;
  const gx = Math.min(nx - 1.001, Math.max(0, x / cell_m - 0.5));
  const gy = Math.min(ny - 1.001, Math.max(0, y / cell_m - 0.5));
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const a = dem[y0 * nx + x0], b = dem[y0 * nx + x0 + 1], c = dem[(y0 + 1) * nx + x0], d = dem[(y0 + 1) * nx + x0 + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

export function xyToLonLat(ds: Dataset, x: number, y: number): [number, number] {
  return [ds.meta.origin.lon + x / ds.meta.m_per_deg.lon, ds.meta.origin.lat + y / ds.meta.m_per_deg.lat];
}

export function zoneIdAt(ds: Dataset, x: number, y: number): string | null {
  const zs = ds.zones.size_m;
  const ix = Math.floor(x / zs), iy = Math.floor(y / zs);
  if (ix < 0 || iy < 0 || ix >= ds.zones.nx || iy >= ds.zones.ny) return null;
  return `zone_${String(iy * ds.zones.nx + ix).padStart(3, "0")}`;
}

export function demRange(ds: Dataset): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const v of ds.grid.dem) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}
