"""Terrain: Copernicus GLO-90 samples -> smoothed 12.5 m DEM -> hydrologically conditioned DEM."""
from __future__ import annotations

import json
import math
import sys
import time
import hashlib
from datetime import datetime, timezone

import numpy as np

from gis_config import *  # noqa: F401,F403  (constants + projection helpers)


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
