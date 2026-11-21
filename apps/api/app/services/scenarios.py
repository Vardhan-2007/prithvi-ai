from __future__ import annotations

import uuid
from collections import OrderedDict
from typing import Any

import numpy as np
from prithvi_risk import BASELINE, evaluate

from .data import dataset, exposure

ASSUMPTIONS = [
    "Rainfall input is user-defined, not a forecast",
    "Drainage inlets are proxy points; blockage is a sensitivity assumption, not an inspection record",
    "Risk index is a relative ranking - not a flood probability or depth estimate",
    "Weights (0.30/0.25/0.25/0.20) are provisional design assumptions, not calibrated coefficients",
]
_STORE: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
_BASE: dict[str, Any] | None = None


def baseline() -> dict[str, Any]:
    global _BASE
    if _BASE is None:
        _BASE = evaluate(dataset(), BASELINE)
    return _BASE


def to_core(req) -> dict:
    return {"name": req.name or "Custom scenario", "rainfall_mm": req.rainfall_scenario.value, "duration_h": req.rainfall_scenario.duration_hours,
            "blockage_fraction": req.drainage_blockage_fraction, "overrides": dict(req.overrides), "pumps": req.pumps}


def create(req) -> dict[str, Any]:
    ds = dataset()
    core = to_core(req)
    res = evaluate(ds, core)
    exp = exposure(ds, res)
    sid = f"scn_{uuid.uuid4().hex[:8]}"
    rec = {"scenario_id": sid, "status": "completed", "data_status": "simulated_scenario", "request": req.model_dump(), "core": core, "result": res,
           "summary": {"zones_in_highest_index_band": res["band_counts"]["highest"],
                       "zones_in_higher_or_highest_band": res["band_counts"]["higher"] + res["band_counts"]["highest"],
                       "roads_intersecting_flagged_zones": exp["roads"], "flagged_road_km": round(exp["road_km"], 2),
                       "facilities_intersecting_flagged_zones": len(exp["facilities"])},
           "mean_index": res["mean_index"], "baseline_mean_index": baseline()["mean_index"], "band_counts": res["band_counts"],
           "assumptions": ASSUMPTIONS, "results_geojson_url": f"/api/v1/scenarios/{sid}/geojson"}
    _STORE[sid] = rec
    while len(_STORE) > 200:
        _STORE.popitem(last=False)
    return rec


def get(sid: str) -> dict[str, Any] | None:
    return _STORE.get(sid)


def simulate(core: dict, res: dict) -> dict[str, Any]:
    """Reference NumPy solver run (same model as the 3D twin). Uncalibrated, illustrative."""
    from prithvi_hydro import VirtualPipeSolver

    ds = dataset()
    g = ds["grid"]; ny, nx = g["ny"], g["nx"]
    dem = np.array(g["dem"]).reshape(ny, nx)
    inl = [(i["iy"], i["ix"], o) for i, o in zip(ds["inlets"], res["inlet_open"])]
    pumps = [(min(ny - 1, int(p["y"] // g["cell_m"])), min(nx - 1, int(p["x"] // g["cell_m"]))) for p in res["pump_sites"]]
    s = VirtualPipeSolver(dem, np.array(g["building_mask"]).reshape(ny, nx), np.array(g["road_mask"]).reshape(ny, nx), g["cell_m"], inl, pumps,
                          core["rainfall_mm"], core["duration_h"])
    out = s.run()
    return {"status": "uncalibrated_scenario_output", "peak_flooded_ha": round(out["peak_flooded_ha"], 2), "peak_max_depth_m": round(out["peak_max_depth"], 3),
            "rain_m3": round(s.expected_rain_m3()), "drained_m3": round(float(out["drain_m3"])), "outfall_m3": round(float(out["outfall_m3"])),
            "stored_m3": round(out["stored_m3"]),
            "note": "Illustrative output of a simplified solver on a coarse terrain model. Not a flood-depth forecast."}
