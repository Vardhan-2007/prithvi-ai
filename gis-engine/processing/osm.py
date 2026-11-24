"""Processing: OpenStreetMap download, parsing, rasterisation and proxy drain-inlet placement."""
from __future__ import annotations

import json
import math
import sys
import time
import hashlib
from datetime import datetime, timezone

import numpy as np

from gis_config import *  # noqa: F401,F403  (constants + projection helpers)


def fetch_osm(refresh: bool) -> dict:
    cache = RAW / "osm_kakinada.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))
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
