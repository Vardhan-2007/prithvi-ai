"""Uncalibrated, simplified 2-D virtual-pipe shallow-water model (after Mei, Decaudin & Hu 2007).

Mirrors apps/web/src/features/twin3d/sim/floodSolver.ts (same constants and update order) so the browser model
can be checked against this reference. Illustrative scenario model only - see docs/methodology.md."""
from __future__ import annotations

from collections import deque

import numpy as np

G = 9.81
ROAD_LOWERING_M = 0.15
RUNOFF_IMPERVIOUS = 0.9
RUNOFF_PERVIOUS = 0.55
INLET_CAPACITY_M3S = 0.25
PUMP_CAPACITY_M3S = 0.15
OUTFALL_CREST_M = 0.30
OUTFALL_CW = 0.5
FLOOD_DEPTH_M = 0.15
DT = 2.0


def rain_rate_mm_h(t: float, total_mm: float, duration_h: float) -> float:
    D = duration_h * 3600.0
    tp = 0.4 * D
    if t < 0 or t >= D:
        return 0.0
    peak = 2 * total_mm / duration_h
    return peak * (t / tp) if t < tp else peak * (1 - (t - tp) / (D - tp))


def cumulative_rain_mm(t: float, total_mm: float, duration_h: float) -> float:
    D = duration_h * 3600.0
    tp = 0.4 * D
    t = min(max(t, 0.0), D)
    peak = 2 * total_mm / duration_h / 3600.0
    if t <= tp:
        return 0.5 * peak * t * t / tp
    return 0.5 * peak * tp + peak * (t - tp) - 0.5 * peak * (t - tp) ** 2 / (D - tp)


class VirtualPipeSolver:
    def __init__(self, dem: np.ndarray, obstacle: np.ndarray, road: np.ndarray, cell: float,
                 inlets: list[tuple[int, int, bool]], pump_cells: list[tuple[int, int]],
                 rain_mm: float, duration_h: float, tail_h: float = 3.0):
        self.ny, self.nx = dem.shape
        self.cell, self.A, self.pipe_a, self.damp = cell, cell * cell, 0.4 * cell, 0.93
        self.wall = obstacle.astype(bool)
        self.z = dem.astype(np.float64) - ROAD_LOWERING_M * road.astype(np.float64)
        self.h = np.zeros_like(self.z)
        self.peak = np.zeros_like(self.z)
        self.f = [np.zeros_like(self.z) for _ in range(4)]  # L, R, S(-y), N(+y)
        self.rain_mm, self.duration_h, self.tail_h = rain_mm, duration_h, tail_h
        self.t = 0.0
        self.rain_m3 = self.drain_m3 = self.outfall_m3 = 0.0
        self.inlets = [(iy, ix) for iy, ix, op in inlets if op]
        self.pumps = list(pump_cells)
        self.rain_w = self._rain_weights(road)
        edges = {"W": dem[:, 0], "E": dem[:, -1], "S": dem[0, :], "N": dem[-1, :]}
        low = min(edges, key=lambda k: float(np.mean(edges[k])))
        mask = np.zeros_like(self.wall)
        if low == "W": mask[:, 0] = True
        elif low == "E": mask[:, -1] = True
        elif low == "S": mask[0, :] = True
        else: mask[-1, :] = True
        self.outfall = mask & ~self.wall

    @property
    def total_seconds(self) -> float:
        return (self.duration_h + self.tail_h) * 3600.0

    def _rain_weights(self, road: np.ndarray) -> np.ndarray:
        ny, nx = self.ny, self.nx
        target = -np.ones((ny, nx), dtype=np.int64)
        q: deque[tuple[int, int]] = deque()
        for y, x in zip(*np.where(~self.wall)):
            target[y, x] = y * nx + x
            q.append((int(y), int(x)))
        while q:
            y, x = q.popleft()
            for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < ny and 0 <= xx < nx and target[yy, xx] < 0:
                    target[yy, xx] = target[y, x]
                    q.append((yy, xx))
        w = np.zeros(ny * nx)
        coef = np.where(self.wall | (road > 0), RUNOFF_IMPERVIOUS, RUNOFF_PERVIOUS)
        tgt = np.where(target >= 0, target, np.arange(ny * nx).reshape(ny, nx))
        np.add.at(w, tgt.ravel(), coef.ravel())
        return w.reshape(ny, nx)

    def step(self, dt: float = DT) -> None:
        h, z, wall, A = self.h, self.z, self.wall, self.A
        rate = rain_rate_mm_h(self.t, self.rain_mm, self.duration_h) / 1000 / 3600
        if rate > 0:
            h += rate * dt * self.rain_w
        for iy, ix in self.inlets:
            d = h[iy, ix]
            if d > 0:
                vol = min(d * A, INLET_CAPACITY_M3S * min(1.0, d / 0.03) * dt)
                h[iy, ix] -= vol / A; self.drain_m3 += vol
        for iy, ix in self.pumps:
            d = h[iy, ix]
            if d > 0:
                vol = min(d * A, PUMP_CAPACITY_M3S * dt)
                h[iy, ix] -= vol / A; self.drain_m3 += vol
        over = np.where(self.outfall, h - OUTFALL_CREST_M, 0.0)
        m = over > 0
        if m.any():
            vol = np.minimum(over[m] * A, OUTFALL_CW * self.cell * over[m] ** 1.5 * dt)
            h[m] -= vol / A; self.outfall_m3 += float(vol.sum())

        k = dt * self.pipe_a * G / self.cell
        H = z + h
        active = (~wall) & (h >= 1e-5)
        fL, fR, fS, fN = self.f

        def pipe(prev: np.ndarray, dh: np.ndarray, valid: np.ndarray) -> np.ndarray:
            return np.where(valid & active, np.maximum(0.0, prev * self.damp + k * dh), 0.0)

        dhL = np.zeros_like(H); vL = np.zeros_like(wall)
        dhL[:, 1:] = H[:, 1:] - H[:, :-1]; vL[:, 1:] = ~wall[:, :-1]
        dhR = np.zeros_like(H); vR = np.zeros_like(wall)
        dhR[:, :-1] = H[:, :-1] - H[:, 1:]; vR[:, :-1] = ~wall[:, 1:]
        dhS = np.zeros_like(H); vS = np.zeros_like(wall)
        dhS[1:, :] = H[1:, :] - H[:-1, :]; vS[1:, :] = ~wall[:-1, :]
        dhN = np.zeros_like(H); vN = np.zeros_like(wall)
        dhN[:-1, :] = H[:-1, :] - H[1:, :]; vN[:-1, :] = ~wall[1:, :]
        l, r, s, u = pipe(fL, dhL, vL), pipe(fR, dhR, vR), pipe(fS, dhS, vS), pipe(fN, dhN, vN)
        tot = l + r + s + u
        with np.errstate(divide="ignore", invalid="ignore"):
            K = np.where(tot * dt > h * A, h * A / (tot * dt), 1.0)
        l, r, s, u = l * K, r * K, s * K, u * K
        tot = l + r + s + u
        self.f = [l, r, s, u]
        inn = np.zeros_like(h)
        inn[:, :-1] += l[:, 1:]                       # cell x receives what x+1 sends left
        inn[:, 1:] += r[:, :-1]                       # ... and what x-1 sends right
        inn[:-1, :] += s[1:, :]                       # receives what y+1 sends south
        inn[1:, :] += u[:-1, :]                       # ... and what y-1 sends north
        h_new = np.maximum(0.0, h + dt * (inn - tot) / A)
        h_new[wall] = 0.0
        self.h = h_new
        np.maximum(self.peak, self.h, out=self.peak)
        self.t += dt

    def stats(self) -> dict:
        stored = float(self.h.sum() * self.A)
        return {"t": self.t, "stored_m3": stored, "drain_m3": self.drain_m3, "outfall_m3": self.outfall_m3,
                "flooded_cells": int((self.h >= FLOOD_DEPTH_M).sum()), "max_depth": float(self.h.max())}

    def expected_rain_m3(self) -> float:
        return cumulative_rain_mm(self.t, self.rain_mm, self.duration_h) / 1000 * float(self.rain_w.sum()) * self.A

    def run(self, dt: float = DT) -> dict:
        while self.t < self.total_seconds - 1e-9:
            self.step(dt)
        pk = self.peak
        return {**self.stats(), "peak_flooded_cells": int((pk >= FLOOD_DEPTH_M).sum()), "peak_max_depth": float(pk.max()),
                "peak_flooded_ha": float((pk >= FLOOD_DEPTH_M).sum() * self.A / 1e4)}
