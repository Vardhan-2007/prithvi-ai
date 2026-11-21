from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from config import AREA_ID, DATA_DIR


@lru_cache(maxsize=1)
def dataset() -> dict[str, Any]:
    path = DATA_DIR / f"{AREA_ID}.json"
    if not path.exists():
        raise RuntimeError(f"{path} missing - run: python3 gis-engine/processing/build_pilot_dataset.py")
    return json.loads(path.read_text())


def xy_to_lonlat(ds: dict, x: float, y: float) -> list[float]:
    m = ds["meta"]
    return [round(m["origin"]["lon"] + x / m["m_per_deg"]["lon"], 7), round(m["origin"]["lat"] + y / m["m_per_deg"]["lat"], 7)]


def zones_geojson(ds: dict, result: dict, baseline: dict | None = None) -> dict:
    zs = ds["zones"]["size_m"]
    W, H = ds["meta"]["size_m"]
    feats = []
    for z, r in zip(ds["zones"]["zones"], result["zones"]):
        x0, y0 = z["ix"] * zs, z["iy"] * zs
        x1, y1 = min(W, x0 + zs), min(H, y0 + zs)
        ring = [xy_to_lonlat(ds, x, y) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0))]
        props = {"zone_id": z["id"], "risk_index": round(r["risk_index"], 2), "band": r["band"], "data_status": "simulated_scenario"}
        if baseline:
            b = baseline["zones"][ds["zones"]["zones"].index(z)]
            props["baseline_index"] = round(b["risk_index"], 2)
            props["delta_from_baseline"] = round(r["risk_index"] - b["risk_index"], 2)
        feats.append({"type": "Feature", "properties": props, "geometry": {"type": "Polygon", "coordinates": [ring]}})
    return {"type": "FeatureCollection", "features": feats}


def exposure(ds: dict, result: dict) -> dict:
    zs, nzx = ds["zones"]["size_m"], ds["zones"]["nx"]
    flagged = {r["zone_id"] for r in result["zones"] if r["band"] in ("higher", "highest")}

    def zone_at(x: float, y: float) -> str:
        return f"zone_{int(y // zs) * nzx + int(x // zs):03d}"

    roads, road_m = set(), 0.0
    for r in ds["roads"]:
        hit = 0.0
        for (x0, y0), (x1, y1) in zip(r["pts"][:-1], r["pts"][1:]):
            if zone_at((x0 + x1) / 2, (y0 + y1) / 2) in flagged:
                hit += ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
        if hit > 0:
            roads.add(r["id"]); road_m += hit
    facs = [f for f in ds["facilities"] if zone_at(f["x"], f["y"]) in flagged]
    return {"flagged_zones": len(flagged), "roads": len(roads), "road_km": road_m / 1000, "facilities": facs}
