// Human names for zones: the nearest named street (OSM) within PLACE_RADIUS_M of the zone centre, else the nearest
// named facility, else the zone id. Computed once per dataset. Names are as mapped in OSM (mostly English).
import type { Dataset } from "./types";

export const PLACE_RADIUS_M = 150;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Nearest named street to a point (local metres), or null if no named street is mapped. */
export function nearestStreet(ds: Dataset, x: number, y: number): { name: string; distM: number } | null {
  let best: { name: string; distM: number } | null = null;
  for (const r of ds.roads) {
    if (!r.name) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const d = segDist(x, y, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
      if (!best || d < best.distM) best = { name: r.name, distM: Math.round(d) };
    }
  }
  return best;
}

export interface ZonePlace { name: string | null; kind: "street" | "facility" | "none"; distM: number | null }

const cache = new WeakMap<Dataset, Map<string, ZonePlace>>();

export function zonePlaces(ds: Dataset): Map<string, ZonePlace> {
  const hit = cache.get(ds);
  if (hit) return hit;
  const out = new Map<string, ZonePlace>();
  const named = ds.facilities.filter((f) => f.name && f.name.trim());
  for (const z of ds.zones.zones) {
    const st = nearestStreet(ds, z.cx, z.cy);
    if (st && st.distM <= PLACE_RADIUS_M) { out.set(z.id, { name: st.name, kind: "street", distM: st.distM }); continue; }
    let bf: { name: string; d: number } | null = null;
    for (const f of named) { const d = Math.hypot(f.x - z.cx, f.y - z.cy); if (d <= PLACE_RADIUS_M && (!bf || d < bf.d)) bf = { name: f.name, d }; }
    out.set(z.id, bf ? { name: bf.name, kind: "facility", distM: Math.round(bf.d) } : { name: null, kind: "none", distM: null });
  }
  cache.set(ds, out);
  return out;
}

/** "Revenue Colony Road" / "near Govt. Hospital" / the zone id when nothing named is close. */
export function zoneLabel(ds: Dataset, zoneId: string, nearWord = "near"): string {
  const p = zonePlaces(ds).get(zoneId);
  if (!p || !p.name) return zoneId;
  return p.kind === "facility" ? `${nearWord} ${p.name}` : p.name;
}
