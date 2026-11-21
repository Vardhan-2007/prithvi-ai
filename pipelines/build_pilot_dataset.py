#!/usr/bin/env python3
"""Build the PRITHVI AI pilot dataset (Kakinada pilot 01).

Real inputs (cached in data/raw/ after the first run):
  * OpenStreetMap via Overpass  -> buildings, roads, facilities, water bodies  (ODbL)
  * Copernicus GLO-90 DEM via the Open-Meteo elevation API -> terrain samples (~90 m)

Derived / proxy products created here (all labelled in the output metadata):
  * 12.5 m simulation grid (DEM smoothed + bilinear upsampled; building + road masks)
  * 100 m analysis zones with terrain / imperviousness / exposure indicators
  * proxy storm-drain inlets (NOT surveyed - OSM has no drainage inventory here)

Usage:  python3 pipelines/build_pilot_dataset.py [--refresh]
Only needs numpy and the standard library.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_PUBLIC = ROOT / "apps" / "web" / "public" / "data"

AREA_ID = "pilot_kakinada_01"
AREA_NAME = "Kakinada town core (pilot 01)"
# Requested bounding box (south, west, north, east). Grid is anchored at the SW corner.
S, W, N, E = 16.9440, 82.2320, 16.9590, 82.2470
CELL = 12.5            # simulation cell size in metres
ZONE_CELLS = 8         # 8 x 8 cells = 100 m analysis zones
USER_AGENT = "prithvi-ai-hackathon-prototype/0.1 (educational)"

LAT0 = (S + N) / 2
M_PER_DEG_LAT = 110540.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))

NX = int(round((E - W) * M_PER_DEG_LON / CELL))
NY = int(round((N - S) * M_PER_DEG_LAT / CELL))
WIDTH_M, HEIGHT_M = NX * CELL, NY * CELL
EAST = W + WIDTH_M / M_PER_DEG_LON
NORTH = S + HEIGHT_M / M_PER_DEG_LAT

ROAD_WIDTH = {"primary": 12, "secondary": 10, "tertiary": 8, "unclassified": 5.5,
              "residential": 5.5, "service": 4, "living_street": 4}
FACILITY_CATEGORY = {
    "hospital": "health", "clinic": "health", "doctors": "health", "pharmacy": "health",
    "fire_station": "emergency", "police": "emergency",
    "school": "shelter", "community_centre": "shelter", "townhall": "shelter",
    "place_of_worship": "shelter",
}


def to_xy(lon: float, lat: float) -> tuple[float, float]:
    return (lon - W) * M_PER_DEG_LON, (lat - S) * M_PER_DEG_LAT


def to_lonlat(x: float, y: float) -> tuple[float, float]:
    return W + x / M_PER_DEG_LON, S + y / M_PER_DEG_LAT


# --------------------------------------------------------------------------- fetch
def http(url: str, data: bytes | None = None, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_osm(refresh: bool) -> dict:
    cache = RAW / "osm_kakinada.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())
    bb = f"({S - 0.001},{W - 0.001},{N + 0.001},{E + 0.001})"
    q = (
        "[out:json][timeout:90];("
        f'way["highway"]{bb};way["building"]{bb};'
        f'node["amenity"~"hospital|clinic|school|fire_station|police|shelter|pharmacy|doctors|community_centre|place_of_worship|townhall"]{bb};'
        f'way["amenity"~"hospital|clinic|school|fire_station|police|shelter|community_centre|townhall"]{bb};'
        f'way["waterway"]{bb};way["natural"="water"]{bb};);out geom;'
    )
    body = urllib.parse.urlencode({"data": q}).encode()
    for ep in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
        try:
            raw = http(ep, body, 130)
            d = json.loads(raw)
            RAW.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(raw)
            return d
        except Exception as exc:  # noqa: BLE001
            print(f"  overpass {ep} failed: {exc}", file=sys.stderr)
    raise SystemExit("Could not fetch OSM data (and no cache present).")


def fetch_dem_samples(refresh: bool) -> dict:
    """Sample Copernicus GLO-90 on a regular lon/lat lattice through Open-Meteo."""
    cache = RAW / "dem_samples_glo90.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())
    n = 21
    lons = [W + (EAST - W) * j / (n - 1) for j in range(n)]
    lats = [S + (NORTH - S) * i / (n - 1) for i in range(n)]
    pts = [(la, lo) for la in lats for lo in lons]
    out: list[float] = []
    for k in range(0, len(pts), 100):
        chunk = pts[k:k + 100]
        url = ("https://api.open-meteo.com/v1/elevation?latitude="
               + ",".join(f"{p[0]:.6f}" for p in chunk)
               + "&longitude=" + ",".join(f"{p[1]:.6f}" for p in chunk))
        for attempt in range(4):
            try:
                out += json.loads(http(url, None, 40))["elevation"]
                break
            except Exception as exc:  # noqa: BLE001
                print(f"  elevation retry {attempt}: {exc}", file=sys.stderr)
                time.sleep(2 + attempt * 2)
        else:
            raise SystemExit("Could not fetch DEM samples (and no cache present).")
        time.sleep(0.4)
    d = {"n": n, "lons": lons, "lats": lats, "elevation_m": out,
         "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
         "source": "Copernicus GLO-90 DSM via Open-Meteo elevation API"}
    RAW.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(d))
    return d


# --------------------------------------------------------------------------- terrain
def build_dem(samples: dict) -> np.ndarray:
    n = samples["n"]
    z = np.array(samples["elevation_m"], dtype=float).reshape(n, n)  # [lat_i, lon_j]
    # GLO-90 is a surface model with +-1 m integer noise in built-up areas: light 3x3 smoothing x2
    for _ in range(2):
        p = np.pad(z, 1, mode="edge")
        z = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 4 * p[1:-1, 1:-1]
             + p[:-2, :-2] + p[:-2, 2:] + p[2:, :-2] + p[2:, 2:]) / 12.0
    gx = (np.arange(NX) + 0.5) / NX * (n - 1)
    gy = (np.arange(NY) + 0.5) / NY * (n - 1)
    x0 = np.clip(np.floor(gx).astype(int), 0, n - 2)
    y0 = np.clip(np.floor(gy).astype(int), 0, n - 2)
    fx, fy = gx - x0, gy - y0
    z00 = z[y0[:, None], x0[None, :]]
    z10 = z[y0[:, None], x0[None, :] + 1]
    z01 = z[y0[:, None] + 1, x0[None, :]]
    z11 = z[y0[:, None] + 1, x0[None, :] + 1]
    dem = (z00 * (1 - fx)[None, :] * (1 - fy)[:, None] + z10 * fx[None, :] * (1 - fy)[:, None]
           + z01 * (1 - fx)[None, :] * fy[:, None] + z11 * fx[None, :] * fy[:, None])
    return dem


def lowest_edge_cells(dem: np.ndarray) -> list[tuple[int, int]]:
    """Cells of the domain edge with the lowest mean ground level (assumed downstream outfall side)."""
    edges = {
        "west": [(y, 0) for y in range(NY)], "east": [(y, NX - 1) for y in range(NY)],
        "south": [(0, x) for x in range(NX)], "north": [(NY - 1, x) for x in range(NX)],
    }
    best = min(edges.values(), key=lambda cells: np.mean([dem[c] for c in cells]))
    return best


def condition_dem(dem: np.ndarray, eps: float = 0.003) -> np.ndarray:
    """Priority-flood depression filling (Barnes et al. 2014) seeded from the downstream edge only.

    Removes spurious pits of the coarse, smoothed surface model so that surface water has a path to the
    outfall; a small epsilon slope keeps flats draining. Standard hydrological DEM conditioning."""
    import heapq
    out = np.full_like(dem, np.inf)
    closed = np.zeros(dem.shape, dtype=bool)
    heap: list[tuple[float, int, int]] = []
    for (y, x) in lowest_edge_cells(dem):
        out[y, x] = dem[y, x]; closed[y, x] = True
        heapq.heappush(heap, (float(dem[y, x]), y, x))
    while heap:
        z, y, x = heapq.heappop(heap)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny_, nx_ = y + dy, x + dx
            if 0 <= ny_ < NY and 0 <= nx_ < NX and not closed[ny_, nx_]:
                closed[ny_, nx_] = True
                out[ny_, nx_] = max(float(dem[ny_, nx_]), z + eps)
                heapq.heappush(heap, (float(out[ny_, nx_]), ny_, nx_))
    return out


# --------------------------------------------------------------------------- vectors
def inside(x: float, y: float, pad: float = 0.0) -> bool:
    return -pad <= x <= WIDTH_M + pad and -pad <= y <= HEIGHT_M + pad


def parse_osm(osm: dict):
    buildings, roads, facilities, water, nodes = [], [], [], [], {}
    for el in osm["elements"]:
        t = el.get("tags", {})
        if el["type"] == "node" and "amenity" in t:
            x, y = to_xy(el["lon"], el["lat"])
            if inside(x, y):
                facilities.append(dict(id=f"n{el['id']}", amenity=t["amenity"], name=t.get("name"), x=x, y=y))
        elif el["type"] == "way":
            geom = el.get("geometry", [])
            if len(geom) < 2:
                continue
            xy = [to_xy(g["lon"], g["lat"]) for g in geom]
            if "building" in t and len(xy) >= 4:
                if not any(inside(x, y) for x, y in xy):
                    continue
                levels = t.get("building:levels")
                h, src = None, "osm"
                try:
                    if "height" in t:
                        h = float(str(t["height"]).split()[0])
                    elif levels:
                        h = float(levels) * 3.2
                except ValueError:
                    h = None
                if h is None:   # proxy height: 2-4 floors, deterministic per OSM id (visualisation only)
                    h = (2 + int(hashlib.md5(str(el["id"]).encode()).hexdigest(), 16) % 3) * 3.2
                    src = "default_proxy"
                buildings.append(dict(id=f"w{el['id']}", h=round(h, 1), h_src=src,
                                      ring=[[round(x, 1), round(y, 1)] for x, y in xy[:-1]]))
                if "amenity" in t and t["amenity"] in FACILITY_CATEGORY:
                    cx = sum(p[0] for p in xy) / len(xy)
                    cy = sum(p[1] for p in xy) / len(xy)
                    if inside(cx, cy):
                        facilities.append(dict(id=f"w{el['id']}", amenity=t["amenity"], name=t.get("name"), x=cx, y=cy))
            elif "highway" in t and t["highway"] in ROAD_WIDTH:
                ids = el.get("nodes", [])
                if len(ids) != len(xy):
                    continue
                for nid, p in zip(ids, xy):
                    nodes[nid] = p
                run: list[int] = []
                runs = []
                for i, p in enumerate(xy):
                    if inside(*p, pad=2):
                        run.append(i)
                    else:
                        if len(run) > 1:
                            runs.append(run)
                        run = []
                if len(run) > 1:
                    runs.append(run)
                for k, r in enumerate(runs):
                    roads.append(dict(id=f"w{el['id']}" + (f"_{k}" if k else ""), cls=t["highway"],
                                      name=t.get("name"), width=ROAD_WIDTH[t["highway"]],
                                      oneway=t.get("oneway") == "yes",
                                      nodes=[ids[i] for i in r],
                                      pts=[[round(xy[i][0], 1), round(xy[i][1], 1)] for i in r]))
            elif "amenity" in t and t["amenity"] in FACILITY_CATEGORY:
                cx = sum(p[0] for p in xy) / len(xy)
                cy = sum(p[1] for p in xy) / len(xy)
                if inside(cx, cy):
                    facilities.append(dict(id=f"w{el['id']}", amenity=t["amenity"], name=t.get("name"), x=cx, y=cy))
            elif t.get("natural") == "water" and len(xy) >= 4:
                if any(inside(x, y) for x, y in xy):
                    water.append(dict(id=f"w{el['id']}", ring=[[round(x, 1), round(y, 1)] for x, y in xy[:-1]]))
    # de-duplicate facilities that are both a node and a building centroid (same amenity within 25 m)
    uniq: list[dict] = []
    for f in facilities:
        if not any(u["amenity"] == f["amenity"] and math.hypot(u["x"] - f["x"], u["y"] - f["y"]) < 25 for u in uniq):
            uniq.append(f)
    for i, f in enumerate(uniq):
        f["category"] = FACILITY_CATEGORY.get(f["amenity"], "other")
        f["name"] = f["name"] or f"Unnamed {f['amenity'].replace('_', ' ')}"
        f["x"], f["y"] = round(f["x"], 1), round(f["y"], 1)
    return buildings, roads, uniq, water, nodes


def rasterise_polygons(rings: list[list[list[float]]]) -> np.ndarray:
    mask = np.zeros((NY, NX), dtype=np.uint8)
    for ring in rings:
        xs = np.array([p[0] for p in ring]); ys = np.array([p[1] for p in ring])
        ix0 = max(0, int(xs.min() // CELL)); ix1 = min(NX - 1, int(xs.max() // CELL))
        iy0 = max(0, int(ys.min() // CELL)); iy1 = min(NY - 1, int(ys.max() // CELL))
        if ix1 < ix0 or iy1 < iy0:
            continue
        cx = (np.arange(ix0, ix1 + 1) + 0.5) * CELL
        cy = (np.arange(iy0, iy1 + 1) + 0.5) * CELL
        PX, PY = np.meshgrid(cx, cy)
        ins = np.zeros(PX.shape, dtype=bool)
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi, xj, yj = xs[i], ys[i], xs[j], ys[j]
            cond = ((yi > PY) != (yj > PY)) & (PX < (xj - xi) * (PY - yi) / (yj - yi + 1e-12) + xi)
            ins ^= cond
            j = i
        # small buildings that miss every cell centre still claim the cell holding their centroid
        if not ins.any():
            ix = min(NX - 1, int(xs.mean() // CELL)); iy = min(NY - 1, int(ys.mean() // CELL))
            mask[iy, ix] = 1
        mask[iy0:iy1 + 1, ix0:ix1 + 1] |= ins.astype(np.uint8)
    return mask


def rasterise_roads(roads: list[dict]) -> np.ndarray:
    mask = np.zeros((NY, NX), dtype=np.uint8)
    for r in roads:
        pts = r["pts"]
        for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
            L = math.hypot(x1 - x0, y1 - y0)
            k = max(1, int(L / 3))
            for s in range(k + 1):
                x = x0 + (x1 - x0) * s / k; y = y0 + (y1 - y0) * s / k
                ix, iy = int(x // CELL), int(y // CELL)
                if 0 <= ix < NX and 0 <= iy < NY:
                    mask[iy, ix] = 1
    return mask


def place_inlets(roads: list[dict], dem: np.ndarray, bmask: np.ndarray, max_n: int = 56):
    """Proxy storm-drain inlets: evenly spread along drivable roads by farthest-point sampling.

    Placement is purely geometric (no bias from terrain) because no drainage inventory is available."""
    cands = []
    for r in roads:
        if r["cls"] in ("service", "living_street"):
            continue
        pts = r["pts"]
        for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
            L = math.hypot(x1 - x0, y1 - y0)
            k = max(1, int(L / 25))
            for s in range(k):
                x = x0 + (x1 - x0) * s / k; y = y0 + (y1 - y0) * s / k
                ix, iy = int(x // CELL), int(y // CELL)
                if 2 <= ix < NX - 2 and 2 <= iy < NY - 2 and not bmask[iy, ix]:
                    cands.append((x, y, ix, iy))
    P = np.array([(c[0], c[1]) for c in cands])
    # start from the candidate nearest the area centre, then repeatedly take the farthest from the chosen set
    first = int(np.argmin(np.hypot(P[:, 0] - WIDTH_M / 2, P[:, 1] - HEIGHT_M / 2)))
    chosen = [first]
    dmin = np.hypot(P[:, 0] - P[first, 0], P[:, 1] - P[first, 1])
    while len(chosen) < min(max_n, len(cands)):
        nxt = int(np.argmax(dmin))
        if dmin[nxt] < 60:
            break
        chosen.append(nxt)
        dmin = np.minimum(dmin, np.hypot(P[:, 0] - P[nxt, 0], P[:, 1] - P[nxt, 1]))
    sel = sorted((cands[i] for i in chosen), key=lambda c: (c[2] // 16, c[3]))
    return [dict(id=f"inlet_{i + 1:02d}", x=round(c[0], 1), y=round(c[1], 1), ix=c[2], iy=c[3],
                 elev=round(float(dem[c[3], c[2]]), 2), status="proxy") for i, c in enumerate(sel)]


def segment_length(pts) -> float:
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:]))


# --------------------------------------------------------------------------- zones
def minmax(a: np.ndarray) -> np.ndarray:
    lo, hi = float(a.min()), float(a.max())
    return np.zeros_like(a) if hi - lo < 1e-9 else (a - lo) / (hi - lo)


def build_zones(dem, bmask, rmask, buildings, roads, facilities, inlets):
    nzx, nzy = math.ceil(NX / ZONE_CELLS), math.ceil(NY / ZONE_CELLS)
    mean_e = np.zeros((nzy, nzx)); imperv = np.zeros((nzy, nzx))
    for zy in range(nzy):
        for zx in range(nzx):
            sl = (slice(zy * ZONE_CELLS, (zy + 1) * ZONE_CELLS), slice(zx * ZONE_CELLS, (zx + 1) * ZONE_CELLS))
            mean_e[zy, zx] = dem[sl].mean()
            imperv[zy, zx] = np.clip(((bmask[sl] > 0) | (rmask[sl] > 0)).mean(), 0, 1)
    p = np.pad(mean_e, 1, mode="edge")
    nb = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + p[:-2, :-2] + p[:-2, 2:] + p[2:, :-2] + p[2:, 2:]) / 8
    T1 = minmax(-mean_e)               # low relative to the pilot area -> higher susceptibility
    T2 = minmax(nb - mean_e)           # sits below its neighbours (local depression)
    T = np.clip(0.65 * T1 + 0.35 * T2, 0, 1)

    zsize = ZONE_CELLS * CELL
    n_b = np.zeros((nzy, nzx)); b_area = np.zeros((nzy, nzx)); road_m = np.zeros((nzy, nzx))
    fac = {k: np.zeros((nzy, nzx), dtype=int) for k in ("health", "emergency", "shelter")}
    for b in buildings:
        cx = sum(q[0] for q in b["ring"]) / len(b["ring"]); cy = sum(q[1] for q in b["ring"]) / len(b["ring"])
        zx, zy = int(cx // zsize), int(cy // zsize)
        if 0 <= zx < nzx and 0 <= zy < nzy:
            n_b[zy, zx] += 1
            a = 0.0
            r = b["ring"]
            for i in range(len(r)):
                a += r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1]
            b_area[zy, zx] += abs(a) / 2
    for r in roads:
        for (x0, y0), (x1, y1) in zip(r["pts"][:-1], r["pts"][1:]):
            L = math.hypot(x1 - x0, y1 - y0)
            k = max(1, int(L / 5))
            for s in range(k):
                x = x0 + (x1 - x0) * (s + .5) / k; y = y0 + (y1 - y0) * (s + .5) / k
                zx, zy = int(x // zsize), int(y // zsize)
                if 0 <= zx < nzx and 0 <= zy < nzy:
                    road_m[zy, zx] += L / k
    for f in facilities:
        zx, zy = int(f["x"] // zsize), int(f["y"] // zsize)
        if 0 <= zx < nzx and 0 <= zy < nzy and f["category"] in fac:
            fac[f["category"]][zy, zx] += 1
    crit = np.minimum(1.0, (fac["health"] + fac["emergency"] * 1.0 + 0.5 * fac["shelter"]) / 2.0)
    E = np.clip(0.5 * minmax(b_area) + 0.3 * minmax(road_m) + 0.2 * crit, 0, 1)

    # inlet influence weights per zone
    zones, sums = [], np.zeros((nzy, nzx))
    for zy in range(nzy):
        for zx in range(nzx):
            cx, cy = (zx + .5) * zsize, (zy + .5) * zsize
            ws = []
            for k, inl in enumerate(inlets):
                d = math.hypot(inl["x"] - cx, inl["y"] - cy)
                if d <= 250:
                    ws.append([k, round(math.exp(-d / 90.0), 4)])
            sums[zy, zx] = sum(w for _, w in ws)
    wref = float(np.percentile(sums, 90)) or 1.0
    for zy in range(nzy):
        for zx in range(nzx):
            zones.append(dict(
                id=f"zone_{zy * nzx + zx:03d}", ix=zx, iy=zy,
                cx=round((zx + .5) * zsize, 1), cy=round((zy + .5) * zsize, 1),
                mean_elev=round(float(mean_e[zy, zx]), 2), terrain=round(float(T[zy, zx]), 4),
                imperv=round(float(imperv[zy, zx]), 4), exposure=round(float(E[zy, zx]), 4),
                n_buildings=int(n_b[zy, zx]), road_m=round(float(road_m[zy, zx]), 1),
                facilities={k: int(v[zy, zx]) for k, v in fac.items()},
                inlets=[[k, w] for k, w in [x for x in _ws(zx, zy, zsize, inlets)]],
            ))
    return dict(nx=nzx, ny=nzy, size_m=zsize, wref=round(wref, 4), zones=zones)


def _ws(zx, zy, zsize, inlets):
    cx, cy = (zx + .5) * zsize, (zy + .5) * zsize
    for k, inl in enumerate(inlets):
        d = math.hypot(inl["x"] - cx, inl["y"] - cy)
        if d <= 250:
            yield k, round(math.exp(-d / 90.0), 4)


# --------------------------------------------------------------------------- metadata
def layer_metadata(osm, dem_samples, counts):
    osm_ts = osm.get("osm3s", {}).get("timestamp_osm_base", "unknown")
    osm_common = dict(source_name="OpenStreetMap contributors (via Overpass API)",
                      source_url="https://www.openstreetmap.org/",
                      retrieved_at=osm_ts, licence_or_terms="ODbL 1.0 - (c) OpenStreetMap contributors",
                      data_status="observed")
    return [
        dict(id="dem", title="Terrain elevation", source_name="Copernicus GLO-90 DEM (via Open-Meteo elevation API)",
             source_url="https://dataspace.copernicus.eu/", retrieved_at=dem_samples["retrieved_at"],
             licence_or_terms="Copernicus DEM licence (free, attribution required)",
             native_resolution_or_scale="~90 m posting; integer-metre vertical values",
             processing_method="21x21 samples, 3x3 smoothing x2, bilinear upsample to 12.5 m grid, then priority-flood depression filling toward the lowest (downstream) edge so surface water can route; terrain index uses the unfilled surface. GLO-90 is a surface model (includes buildings/trees).",
             data_status="derived",
             known_limitations="Coarse, noisy in built-up areas; cannot resolve kerbs, culverts or underpasses. Sub-metre relief is not reliable."),
        dict(id="buildings", title=f"Buildings ({counts['buildings']})", **osm_common,
             native_resolution_or_scale="vector footprints, completeness varies",
             processing_method="Footprints clipped to the pilot extent; heights from OSM tags where present, otherwise a proxy of 2-4 storeys (visualisation only).",
             known_limitations="OSM completeness varies - the area is likely under-mapped. Default heights are a proxy."),
        dict(id="roads", title=f"Road network ({counts['roads']} segments)", **osm_common,
             native_resolution_or_scale="vector centrelines",
             processing_method="Highway ways clipped to extent; widths assigned by class; rasterised to the 12.5 m grid and lowered 0.15 m in the solver (assumed kerb-channel effect).",
             known_limitations="Width, kerb height and drainage by class are assumptions."),
        dict(id="facilities", title=f"Critical facilities ({counts['facilities']})", **osm_common,
             native_resolution_or_scale="points", processing_method="Amenity nodes/ways; building polygons reduced to centroids; near-duplicates merged.",
             known_limitations="Mapped facilities only; capacity, status and shelter suitability unknown. Not a verified emergency inventory."),
        dict(id="water", title=f"Water bodies ({counts['water']})", **osm_common,
             native_resolution_or_scale="vector polygons", processing_method="natural=water polygons clipped to extent; display only.",
             known_limitations="Display only; not coupled into the solver."),
        dict(id="drainage", title=f"Storm-drain inlets ({counts['inlets']}, proxy)", source_name="Team assumption (proxy)",
             source_url="", retrieved_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
             licence_or_terms="n/a", native_resolution_or_scale="points",
             processing_method="Farthest-point sampling along drivable roads (even spread, no terrain bias); each inlet carries an assumed capacity in the solver.",
             data_status="proxy",
             known_limitations="No surveyed drainage inventory was available. Locations, capacity and blockage are scenario assumptions, not an inspection record. Do not use to infer where real drains are."),
        dict(id="rainfall", title="Rainfall input", source_name="User-defined scenario (not a forecast)",
             source_url="https://gpm.nasa.gov/data/imerg", retrieved_at="", licence_or_terms="n/a",
             native_resolution_or_scale="uniform over the pilot area (IMERG native: ~0.1 deg / 30 min, too coarse for street level)",
             processing_method="Total depth over a chosen duration, distributed with a triangular-peaked hyetograph.",
             data_status="simulated",
             known_limitations="Spatially uniform; no antecedent moisture; no real event calibration."),
        dict(id="risk_zones", title="Analysis zones (100 m)", source_name="PRITHVI AI derived index",
             source_url="", retrieved_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
             licence_or_terms="derived from layers above", native_resolution_or_scale="100 m zones",
             processing_method="Terrain, drainage vulnerability and exposure normalised to 0-1 and combined with provisional weights 0.30/0.25/0.25/0.20.",
             data_status="derived",
             known_limitations="Indicative relative index. Not a probability, not calibrated, not a depth estimate."),
    ]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-download raw data")
    args = ap.parse_args()

    print("Fetching OSM ...")
    osm = fetch_osm(args.refresh)
    print("Fetching DEM samples ...")
    dem_s = fetch_dem_samples(args.refresh)
    buildings, roads, facilities, water, nodes = parse_osm(osm)
    print(f"  buildings={len(buildings)} roads={len(roads)} facilities={len(facilities)} water={len(water)}")

    dem_raw = build_dem(dem_s)
    dem = condition_dem(dem_raw)
    filled = dem - dem_raw
    print(f"  depression filling raised {(filled > 0.001).mean() * 100:.1f}% of cells (max {filled.max():.2f} m)")
    bmask = rasterise_polygons([b["ring"] for b in buildings])
    rmask = rasterise_roads(roads)
    inlets = place_inlets(roads, dem_raw, bmask)
    zones = build_zones(dem_raw, bmask, rmask, buildings, roads, facilities, inlets)
    counts = dict(buildings=len(buildings), roads=len(roads), facilities=len(facilities),
                  water=len(water), inlets=len(inlets))

    used = {n for r in roads for n in r["nodes"]}
    road_nodes = {str(k): [round(v[0], 1), round(v[1], 1)] for k, v in nodes.items() if k in used}
    for r in roads:
        r["nodes"] = [str(n) for n in r["nodes"]]

    out = dict(
        meta=dict(area_id=AREA_ID, name=AREA_NAME, generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                  origin=dict(lon=W, lat=S), bbox=[W, S, EAST, NORTH], size_m=[WIDTH_M, HEIGHT_M],
                  m_per_deg=dict(lon=M_PER_DEG_LON, lat=M_PER_DEG_LAT), crs="local metres (equirectangular) from SW corner; GeoJSON-style lon/lat via origin + m_per_deg",
                  statement="Experimental planning and visualisation prototype. Values are indicative scenario indices, not forecasts."),
        grid=dict(nx=NX, ny=NY, cell_m=CELL, dem=[round(float(v), 2) for v in dem.ravel()],
                  building_mask=bmask.ravel().tolist(), road_mask=rmask.ravel().tolist()),
        buildings=buildings, roads=roads, road_nodes=road_nodes, facilities=facilities, water=water, inlets=inlets,
        zones=zones, layers=layer_metadata(osm, dem_s, counts),
    )
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB_PUBLIC.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(out, separators=(",", ":"))
    (PROCESSED / f"{AREA_ID}.json").write_text(txt)
    (WEB_PUBLIC / f"{AREA_ID}.json").write_text(txt)
    print(f"Grid {NX}x{NY} @ {CELL} m  ({WIDTH_M:.0f} x {HEIGHT_M:.0f} m)  zones={len(zones['zones'])}")
    print(f"DEM range {dem.min():.2f}..{dem.max():.2f} m | building cells {int(bmask.sum())} | road cells {int(rmask.sum())}")
    print(f"Wrote {PROCESSED / (AREA_ID + '.json')} ({len(txt) / 1024:.0f} KB) and copy in apps/web/public/data/")

    # YAML provenance table (hand-rolled to avoid a PyYAML dependency)
    lines = ["# Generated by pipelines/build_pilot_dataset.py - provenance for every layer", "layers:"]
    for L in out["layers"]:
        lines.append(f"  - id: {L['id']}")
        for k, v in L.items():
            if k != "id":
                lines.append(f"    {k}: {json.dumps(v, ensure_ascii=False)}")
    (ROOT / "data" / "metadata" / "layers.yaml").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
