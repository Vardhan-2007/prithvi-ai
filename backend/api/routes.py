from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from config import AREA_ID, VERSION
from models.schemas import AssistantRequest, ScenarioRequest
from services import assistant, scenarios
from services.data import dataset, zones_geojson

router = APIRouter()
_SIM_LOCK = asyncio.Lock()


def _area(area_id: str) -> dict:
    if area_id != AREA_ID:
        raise HTTPException(404, f"unknown area '{area_id}'")
    return dataset()


def _scn(sid: str) -> dict:
    rec = scenarios.get(sid)
    if not rec:
        raise HTTPException(404, f"unknown scenario '{sid}'")
    return rec


@router.get("/health")
def health():
    return {"status": "ok", "version": VERSION}


@router.get("/api/v1/areas")
def areas():
    ds = dataset()
    return [{"id": ds["meta"]["area_id"], "name": ds["meta"]["name"], "bbox": ds["meta"]["bbox"], "zones": len(ds["zones"]["zones"]),
             "statement": ds["meta"]["statement"]}]


@router.get("/api/v1/areas/{area_id}/layers")
def layers(area_id: str):
    return _area(area_id)["layers"]


@router.get("/api/v1/areas/{area_id}/baseline")
def baseline(area_id: str):
    ds = _area(area_id)
    b = scenarios.baseline()
    return {"data_status": "simulated_scenario", "scenario": b["scenario"], "mean_index": b["mean_index"], "band_counts": b["band_counts"],
            "assumptions": scenarios.ASSUMPTIONS, "geojson": zones_geojson(ds, b)}


@router.get("/api/v1/areas/{area_id}/facilities")
def facilities(area_id: str):
    ds = _area(area_id)
    return {"data_status": "observed", "attribution": "(c) OpenStreetMap contributors, ODbL", "items": [
        {**f, "lonlat": [ds["meta"]["origin"]["lon"] + f["x"] / ds["meta"]["m_per_deg"]["lon"], ds["meta"]["origin"]["lat"] + f["y"] / ds["meta"]["m_per_deg"]["lat"]]}
        for f in ds["facilities"]]}


@router.post("/api/v1/scenarios", status_code=201)
async def create_scenario(req: ScenarioRequest):
    _area(req.area_id)
    if req.simulate and req.rainfall_scenario.duration_hours > 12:
        raise HTTPException(422, "simulate=true supports durations up to 12 h")
    keys = ("scenario_id", "status", "data_status", "score_stage", "summary", "mean_index", "baseline_mean_index", "band_counts", "assumptions", "results_geojson_url")
    if req.simulate:
        # the reference solver takes ~10 s of CPU: run one at a time so a burst of requests cannot exhaust a small host
        if _SIM_LOCK.locked():
            raise HTTPException(429, "the reference solver is busy; retry in a few seconds", headers={"Retry-After": "10"})
        rec = scenarios.create(req)
        async with _SIM_LOCK:
            sim = await run_in_threadpool(scenarios.simulate, rec["core"], rec["result"])
        scenarios.finalize(rec, sim.pop("_zone_water"))
        out = {k: rec[k] for k in keys}
        out["simulation"] = sim
        out["zones"] = [{"zone_id": z["zone_id"], "risk_index": round(z["risk_index"], 2), "band": z["band"], "water": round(z["factors"]["water"], 4)}
                        for z in rec["result"]["zones"]]
        return out
    rec = scenarios.create(req)
    return {k: rec[k] for k in keys}


@router.get("/api/v1/scenarios/{sid}")
def get_scenario(sid: str):
    rec = _scn(sid)
    return {k: rec[k] for k in ("scenario_id", "status", "data_status", "score_stage", "request", "summary", "mean_index", "baseline_mean_index", "band_counts", "assumptions")}


@router.get("/api/v1/scenarios/{sid}/geojson")
def scenario_geojson(sid: str):
    rec = _scn(sid)
    return zones_geojson(dataset(), rec["result"], scenarios.baseline_for(rec["result"]))


@router.get("/api/v1/scenarios/{sid}/compare")
def compare(sid: str):
    rec = _scn(sid)
    s = rec["result"]
    b = scenarios.baseline_for(s)
    order = ["lower", "moderate", "higher", "highest"]
    moved = [{"zone_id": zs["zone_id"], "from": zb["band"], "to": zs["band"], "delta": round(zs["risk_index"] - zb["risk_index"], 2)}
             for zb, zs in zip(b["zones"], s["zones"]) if zs["band"] != zb["band"]]
    return {"scenario_id": sid, "data_status": "simulated_scenario", "score_stage": s.get("stage", "provisional"),
            "baseline": {"mean_index": b["mean_index"], "band_counts": b["band_counts"]}, "scenario": {"mean_index": s["mean_index"], "band_counts": s["band_counts"]},
            "zones_changed_band": len(moved), "zones_moved_up": sum(1 for m in moved if order.index(m["to"]) > order.index(m["from"])),
            "changed": moved[:200], "assumptions": scenarios.ASSUMPTIONS}


@router.get("/api/v1/zones/{zone_id}/explanation")
def explanation(zone_id: str, scenario_id: str | None = Query(default=None)):
    ds = dataset()
    rec = _scn(scenario_id) if scenario_id else None
    res = rec["result"] if rec else scenarios.baseline()
    ids = [z["id"] for z in ds["zones"]["zones"]]
    if zone_id not in ids:
        raise HTTPException(404, f"unknown zone '{zone_id}'")
    i = ids.index(zone_id)
    z, r, b = ds["zones"]["zones"][i], res["zones"][i], scenarios.baseline_for(res)["zones"][i]
    sc = res["scenario"]
    lvl = lambda v: "high" if v >= 0.66 else "low" if v <= 0.33 else "moderate"  # noqa: E731
    sentences = [
        f"The terrain indicator is {lvl(r['factors']['terrain'])} ({r['factors']['terrain']:.2f}) relative to the pilot area (mean elevation {z['mean_elev']:.1f} m).",
        (f"Simulated water factor W is {r['factors']['water']:.2f} from this scenario's own flood run; rain "
         f"({sc['rainfall_mm']:.0f} mm over {sc['duration_h']:g} h) and blocked drains act through it."
         if res.get("stage") == "final" else
         f"The rainfall scenario is {sc['rainfall_mm']:.0f} mm over {sc['duration_h']:g} h (about {res['intensity_mm_h']:.0f} mm/h); a user-chosen input."),
        f"{r['open_inlets']} of {r['total_inlets']} nearby proxy drain inlets are open; local drainage capacity is {r['drain_capacity'] * 100:.0f}%.",
        f"The zone contains {z['n_buildings']} mapped buildings, {z['road_m']:.0f} m of road and {sum(z['facilities'].values())} mapped critical facilities.",
    ]
    return {"zone_id": zone_id, "risk_index": round(r["risk_index"], 2), "baseline_index": round(b["risk_index"], 2), "band": r["band"],
            "label": {"lower": "Lower relative index", "moderate": "Moderate relative index", "higher": "Higher relative index", "highest": "Highest relative index"}[r["band"]],
            "factors": {k: round(v, 3) for k, v in r["factors"].items()}, "contributions": {k: round(v, 2) for k, v in r["contributions"].items()},
            "score_stage": res.get("stage", "provisional"),
            "explanation": sentences, "status": "indicative scenario; not a validated flood probability"}


@router.post("/api/v1/assistant/query")
def assistant_query(req: AssistantRequest):
    return assistant.ask(req.query, req.live_context)
