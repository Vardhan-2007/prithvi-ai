"""Provisional: RiskIndex = 100 * (wT*T + wR*R + wD*D + wE*E).  Final (with the simulated-water factor W from the
scenario's own flood run): RiskIndex = 100 * (wT*T + wD*D + wE*E + wW*W). An INDEX (relative ranking), not a
probability or a depth.

Keep in lock-step with frontend/src/scenarios/engine/risk.ts - the parity test in ai-engine/risk_scoring/tests enforces it."""
from __future__ import annotations

import math
from typing import Any

WEIGHTS = {"terrain": 0.30, "rainfall": 0.25, "drainage": 0.25, "exposure": 0.20, "water": 0.0}        # provisional
WEIGHTS_FINAL = {"terrain": 0.20, "rainfall": 0.0, "drainage": 0.15, "exposure": 0.20, "water": 0.45}  # with W (assumed)
FACTOR_KEYS = ("terrain", "rainfall", "drainage", "exposure", "water")
WATER_FLOOD_M = 0.15
WATER_SHARE_REF = 0.5
WATER_DEPTH_REF_M = 0.5
WATER_PERCENTILE = 0.9
BAND_THRESHOLDS = {"moderate": 35.0, "higher": 48.0, "highest": 60.0}
RAIN_DEPTH_REF_MM = 250.0
RAIN_INTENSITY_REF_MMH = 100.0
INLET_KERNEL_M = 90.0
PUMP_COUNT = 6
BASELINE = {"name": "Baseline reference", "rainfall_mm": 30.0, "duration_h": 6.0, "blockage_fraction": 0.0, "overrides": {}, "pumps": False}
M32 = 0xFFFFFFFF
# High sea level (tide + surge) backs up the drains: same assumed curve as backend/simulation/virtual_pipe.py drain_factor
TIDE_FREE_M = 0.5
TIDE_FULL_M = 2.0
TIDE_MAX_LOSS = 0.7


def clamp01(v: float) -> float:
    return min(1.0, max(0.0, v))


def drain_factor(sea_level_m: float) -> float:
    return 1.0 - TIDE_MAX_LOSS * clamp01((float(sea_level_m or 0.0) - TIDE_FREE_M) / (TIDE_FULL_M - TIDE_FREE_M))


def band_of(index: float) -> str:
    if index >= BAND_THRESHOLDS["highest"]:
        return "highest"
    if index >= BAND_THRESHOLDS["higher"]:
        return "higher"
    if index >= BAND_THRESHOLDS["moderate"]:
        return "moderate"
    return "lower"


def rainfall_factor(total_mm: float, duration_h: float) -> tuple[float, float]:
    intensity = total_mm / max(0.25, duration_h)
    r = clamp01(0.5 * clamp01(total_mm / RAIN_DEPTH_REF_MM) + 0.5 * clamp01(intensity / RAIN_INTENSITY_REF_MMH))
    return r, intensity


def _imul(a: int, b: int) -> int:
    return (a * b) & M32


def _mulberry32(seed: int):
    a = seed & M32

    def rnd() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return rnd


def inlet_order(n: int) -> list[int]:
    """Deterministic permutation so 'x% blocked' always blocks the same inlets (same as the browser)."""
    rnd = _mulberry32(20261121)
    idx = list(range(n))
    for i in range(n - 1, 0, -1):
        j = math.floor(rnd() * (i + 1))
        idx[i], idx[j] = idx[j], idx[i]
    return idx


def resolve_inlet_open(inlets: list[dict], blockage_fraction: float, overrides: dict[str, str]) -> list[bool]:
    n = len(inlets)
    n_blocked = round(clamp01(blockage_fraction) * n)
    # JS Math.round rounds half up; Python round() is banker's - make them agree
    n_blocked = math.floor(clamp01(blockage_fraction) * n + 0.5)
    auto = set(inlet_order(n)[:n_blocked])
    out = []
    for i, inl in enumerate(inlets):
        o = overrides.get(inl["id"])
        out.append(True if o == "cleared" else False if o == "blocked" else i not in auto)
    return out


def weights_for(stage: str) -> dict[str, float]:
    return WEIGHTS_FINAL if stage == "final" else WEIGHTS


def _quantile_sorted(a: list[float], q: float) -> float:
    if not a:
        return 0.0
    pos = (len(a) - 1) * q
    lo = math.floor(pos)
    hi = min(len(a) - 1, lo + 1)
    return a[lo] + (a[hi] - a[lo]) * (pos - lo)


def zone_water(ds: dict, peak) -> list[float]:
    """Simulated-water factor W (0..1) per zone from a flat grid of peak depths (m), same layout as ds['grid'].
    W = 0.5*min(1, flooded share / WATER_SHARE_REF) + 0.5*min(1, 90th-percentile peak / WATER_DEPTH_REF_M),
    over the zone's non-building cells. Mirrors zoneWater() in risk.ts."""
    g = ds["grid"]
    nx, ny, cell, bm = g["nx"], g["ny"], g["cell_m"], g["building_mask"]
    per = int(round(ds["zones"]["size_m"] / cell))
    peak = [float(v) for v in (peak.ravel() if hasattr(peak, "ravel") else peak)]
    out = []
    for z in ds["zones"]["zones"]:
        vals = []
        for j in range(z["iy"] * per, min(ny, (z["iy"] + 1) * per)):
            for i in range(z["ix"] * per, min(nx, (z["ix"] + 1) * per)):
                c = j * nx + i
                if not bm[c]:
                    vals.append(peak[c])
        if not vals:
            out.append(0.0)
            continue
        wet = sum(1 for v in vals if v >= WATER_FLOOD_M)
        vals.sort()
        share, pq = wet / len(vals), _quantile_sorted(vals, WATER_PERCENTILE)
        out.append(clamp01(0.5 * min(1.0, share / WATER_SHARE_REF) + 0.5 * min(1.0, pq / WATER_DEPTH_REF_M)))
    return out


def _compute(ds: dict, sc: dict, pumps: list[dict], water: list[float] | None = None) -> dict[str, Any]:
    r, intensity = rainfall_factor(sc["rainfall_mm"], sc["duration_h"])
    stage = "final" if water is not None else "provisional"
    wt = weights_for(stage)
    open_ = resolve_inlet_open(ds["inlets"], sc["blockage_fraction"], sc.get("overrides", {}))
    wref = ds["zones"]["wref"]
    sea_f = drain_factor(sc.get("sea_level_m", 0.0))
    zones = []
    for zi, z in enumerate(ds["zones"]["zones"]):
        s, n_open = 0.0, 0
        for k, w in z["inlets"]:
            if open_[k]:
                s += w
                n_open += 1
        for p in pumps:
            d = math.hypot(p["x"] - z["cx"], p["y"] - z["cy"])
            if d <= 250:
                s += math.exp(-d / INLET_KERNEL_M)
        cap = clamp01(s / wref) * sea_f
        d_f = clamp01(0.6 * (1 - cap) + 0.4 * z["imperv"])
        w_f = clamp01(water[zi]) if water is not None else 0.0
        contrib = {
            "terrain": 100 * wt["terrain"] * z["terrain"], "rainfall": 100 * wt["rainfall"] * r,
            "drainage": 100 * wt["drainage"] * d_f, "exposure": 100 * wt["exposure"] * z["exposure"],
            "water": 100 * wt["water"] * w_f,
        }
        index = contrib["terrain"] + contrib["rainfall"] + contrib["drainage"] + contrib["exposure"] + contrib["water"]
        zones.append({"zone_id": z["id"], "risk_index": index, "band": band_of(index),
                      "factors": {"terrain": z["terrain"], "rainfall": r, "drainage": d_f, "exposure": z["exposure"], "water": w_f},
                      "contributions": contrib, "drain_capacity": cap, "open_inlets": n_open, "total_inlets": len(z["inlets"])})
    counts = {"lower": 0, "moderate": 0, "higher": 0, "highest": 0}
    for z in zones:
        counts[z["band"]] += 1
    return {"scenario": sc, "stage": stage, "rainfall_factor": r, "intensity_mm_h": intensity, "zones": zones,
            "mean_index": sum(z["risk_index"] for z in zones) / len(zones), "band_counts": counts, "inlet_open": open_}


def choose_pump_sites(ds: dict, no_pump: dict) -> list[dict]:
    by_id = {z["id"]: z for z in ds["zones"]["zones"]}
    ranked = sorted(no_pump["zones"], key=lambda zr: -(zr["risk_index"] * (0.6 + 0.4 * by_id[zr["zone_id"]]["exposure"])))
    sites: list[dict] = []
    for zr in ranked:
        z = by_id[zr["zone_id"]]
        if all(math.hypot(s["x"] - z["cx"], s["y"] - z["cy"]) >= 150 for s in sites):
            sites.append({"zone_id": z["id"], "x": z["cx"], "y": z["cy"]})
        if len(sites) >= PUMP_COUNT:
            break
    return sites


def evaluate(ds: dict, sc: dict, water: list[float] | None = None) -> dict[str, Any]:
    """Provisional without `water`; final with the per-zone simulated-water factor from zone_water().
    Pump sites always come from the provisional, no-pump scenario (pumps change the water, so using W would be circular)."""
    sc = {**BASELINE, **sc}
    if water is not None and len(water) != len(ds["zones"]["zones"]):
        raise ValueError("water must have one value per zone")
    if not sc.get("pumps"):
        return {**_compute(ds, sc, [], water), "pump_sites": []}
    base = _compute(ds, {**sc, "pumps": False}, [])
    sites = choose_pump_sites(ds, base)
    return {**_compute(ds, sc, sites, water), "pump_sites": sites}
