from __future__ import annotations

import json
import uuid
from collections import OrderedDict
from typing import Any

import numpy as np
from risk_scoring import BASELINE, evaluate, zone_water

from config import DATA_DIR

from .data import dataset, exposure

ASSUMPTIONS = [
    "Rainfall input is user-defined (a total or an hour-by-hour hyetograph); it is a scenario, not an official forecast",
    "Drainage inlets are proxy points; blockage is a sensitivity assumption, not an inspection record",
    "Risk index is a relative ranking - not a flood probability or depth estimate",
    "Weights are design assumptions, not calibrated coefficients: provisional 0.30 terrain / 0.25 rainfall / 0.25 drainage / 0.20 exposure; "
    "final (after the flood run) 0.20 terrain / 0.15 drainage / 0.20 exposure / 0.45 simulated water",
]
_STORE: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
_BASE: dict[str, Any] | None = None
_BASE_FINAL: dict[str, Any] | None = None
BASELINE_WATER = DATA_DIR / "baseline_water.json"


def baseline(stage: str = "provisional") -> dict[str, Any]:
    """Baseline result at the requested stage. The final baseline uses the precomputed simulated-water factor
    (data/processed/baseline_water.json, written by frontend/scripts/export-baseline-water.ts); if that file is
    missing it falls back to the provisional baseline."""
    global _BASE, _BASE_FINAL
    if _BASE is None:
        _BASE = evaluate(dataset(), BASELINE)
    if stage != "final":
        return _BASE
    if _BASE_FINAL is None and BASELINE_WATER.exists():
        w = json.loads(BASELINE_WATER.read_text())["water"]
        _BASE_FINAL = evaluate(dataset(), BASELINE, water=w)
    return _BASE_FINAL or _BASE


def baseline_for(result: dict[str, Any]) -> dict[str, Any]:
    return baseline(result.get("stage", "provisional"))


def _summary(ds: dict, res: dict) -> dict[str, Any]:
    exp = exposure(ds, res)
    return {"zones_in_highest_index_band": res["band_counts"]["highest"],
            "zones_in_higher_or_highest_band": res["band_counts"]["higher"] + res["band_counts"]["highest"],
            "roads_intersecting_flagged_zones": exp["roads"], "flagged_road_km": round(exp["road_km"], 2),
            "facilities_intersecting_flagged_zones": len(exp["facilities"])}


def to_core(req) -> dict:
    rs = req.rainfall_scenario
    core = {"name": req.name or "Custom scenario", "rainfall_mm": rs.value, "duration_h": rs.duration_hours,
            "blockage_fraction": req.drainage_blockage_fraction, "overrides": dict(req.overrides), "pumps": req.pumps,
            "soil_wetness": req.soil_wetness, "sea_level_m": req.sea_level_m}
    if rs.kind == "hyetograph":
        core["hyetograph_mm"] = list(rs.hyetograph_mm)
        core["step_h"] = rs.step_hours
    return core


def create(req) -> dict[str, Any]:
    ds = dataset()
    core = to_core(req)
    res = evaluate(ds, core)
    sid = f"scn_{uuid.uuid4().hex[:8]}"
    rec = {"scenario_id": sid, "status": "completed", "data_status": "simulated_scenario", "request": req.model_dump(), "core": core, "result": res,
           "score_stage": "provisional", "summary": _summary(ds, res),
           "mean_index": res["mean_index"], "baseline_mean_index": baseline()["mean_index"], "band_counts": res["band_counts"],
           "assumptions": ASSUMPTIONS, "results_geojson_url": f"/api/v1/scenarios/{sid}/geojson"}
    _STORE[sid] = rec
    while len(_STORE) > 200:
        _STORE.popitem(last=False)
    return rec


def get(sid: str) -> dict[str, Any] | None:
    return _STORE.get(sid)


def finalize(rec: dict[str, Any], water: list[float]) -> None:
    """Rescore a stored scenario with the simulated-water factor W from its own flood run (FINAL stage)."""
    ds = dataset()
    res = evaluate(ds, rec["core"], water=water)
    rec.update(result=res, score_stage="final", summary=_summary(ds, res), mean_index=res["mean_index"],
               baseline_mean_index=baseline("final")["mean_index"], band_counts=res["band_counts"])


def simulate(core: dict, res: dict) -> dict[str, Any]:
    """Reference NumPy solver run (same model as the 3D twin). Uncalibrated, illustrative."""
    from simulation import VirtualPipeSolver, step_storm

    ds = dataset()
    g = ds["grid"]; ny, nx = g["ny"], g["nx"]
    dem = np.array(g["dem"]).reshape(ny, nx)
    inl = [(i["iy"], i["ix"], o) for i, o in zip(ds["inlets"], res["inlet_open"])]
    pumps = [(min(ny - 1, int(p["y"] // g["cell_m"])), min(nx - 1, int(p["x"] // g["cell_m"]))) for p in res["pump_sites"]]
    s = VirtualPipeSolver(dem, np.array(g["building_mask"]).reshape(ny, nx), np.array(g["road_mask"]).reshape(ny, nx), g["cell_m"], inl, pumps,
                          core["rainfall_mm"], core["duration_h"],
                          storm=step_storm(core["hyetograph_mm"], core["step_h"]) if core.get("hyetograph_mm") else None,
                          soil_wetness=core.get("soil_wetness", 0.0), sea_level_m=core.get("sea_level_m", 0.0))
    out = s.run()
    water = zone_water(ds, s.peak)
    return {"status": "uncalibrated_scenario_output", "_zone_water": water, "peak_flooded_ha": round(out["peak_flooded_ha"], 2), "peak_max_depth_m": round(out["peak_max_depth"], 3),
            "rain_m3": round(s.expected_rain_m3()), "drained_m3": round(float(out["drain_m3"])), "outfall_m3": round(float(out["outfall_m3"])),
            "stored_m3": round(out["stored_m3"]),
            "note": "Illustrative output of a simplified solver on a coarse terrain model. Not a flood-depth forecast."}
