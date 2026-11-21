"""Risk analysis: per-zone terrain / imperviousness / exposure indicators and proxy-inlet influence weights."""
from __future__ import annotations

import json
import math
import sys
import time
import hashlib
from datetime import datetime, timezone

import numpy as np

from gis_config import *  # noqa: F401,F403  (constants + projection helpers)


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
