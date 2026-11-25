#!/usr/bin/env python3
"""Upgrade the pilot's terrain and/or burn in the drains mapped in OpenStreetMap, and MEASURE the change with the
replay check before keeping it.

  --dem glo30   Copernicus GLO-30 (30 m) instead of GLO-90 (90 m): read straight from the public AWS bucket, only the
                tiles the pilot needs (gis-engine/terrain/cog.py). GLO-30 is still a surface model (roofs and trees).
  --drains      open drains, ditches, canals and streams mapped in OSM are cut into the terrain as channels (assumed
                depths below), so water can collect in them and run along them. Culverts (tunnel=*) are shown only.
  --apply       write the new dataset (data/processed + the frontend copy). Without it nothing in the repo changes.
  --no-replay   skip the replay comparison (it runs the reference solver 2 x per day, about a minute per run).

The comparison replays every day that has reports inside the pilot, with the day's actual rain (Open-Meteo archive)
and 25 % drain blockage, on the current dataset and on the candidate, and counts hits as the Replay tab does. Results go
to data/validation/upgrade_check.json. The OSM parts of the dataset (buildings, roads, facilities, inlets) are kept.

Usage (repo root, with the venv active):
  python3 gis-engine/processing/upgrade_pilot.py --dem glo30 --drains            # build + compare only
  python3 gis-engine/processing/upgrade_pilot.py --dem glo30 --drains --apply    # build + compare + write
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import sys
import time
import urllib.parse
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "backend"))
sys.path.insert(0, str(HERE.parent / "ai-engine"))

import numpy as np  # noqa: E402

from gis_config import *  # noqa: E402,F401,F403
from risk_analysis.zones import build_zones  # noqa: E402
from terrain.dem import build_dem, condition_dem, fetch_dem_samples  # noqa: E402

CHANNEL_DEPTH_M = {"drain": 0.5, "ditch": 0.5, "stream": 0.8, "canal": 1.2, "river": 1.5}   # ASSUMED channel depths
GLO30_N = 56                     # lattice points per side (~30 m spacing over the 1.6 x 1.7 km pilot)
HIT_RADIUS_M = 150.0             # same as the Replay tab (frontend/src/scenarios/engine/replay.ts)
BLOCKAGE = 0.25
VALIDATION = ROOT / "data" / "validation"


# ---------------------------------------------------------------- inputs
def fetch_glo30_samples(refresh: bool) -> dict:
    from terrain.cog import COG, GLO30_BASE, GLO30_BASE_FALLBACK, glo30_url, http_reader
    cache = RAW / "dem_samples_glo30.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())
    n = GLO30_N
    lons = [W + (EAST - W) * j / (n - 1) for j in range(n)]
    lats = [S + (NORTH - S) * i / (n - 1) for i in range(n)]
    last: Exception | None = None
    for base in (GLO30_BASE, GLO30_BASE_FALLBACK):
        url = glo30_url((S + NORTH) / 2, (W + EAST) / 2, base)
        try:
            cog = COG(http_reader(url))
            vals = [round(cog.sample(lo, la), 3) for la in lats for lo in lons]
            break
        except Exception as exc:  # noqa: BLE001
            print(f"  GLO-30 {url} failed: {exc}", file=sys.stderr)
            last = exc
    else:
        raise SystemExit(f"Could not read Copernicus GLO-30 ({last}). Nothing was changed.")
    d = {"n": n, "lons": lons, "lats": lats, "elevation_m": vals, "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
         "source": "Copernicus GLO-30 DSM (AWS open data, COG) read with range requests", "url": url}
    RAW.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(d))
    return d


def fetch_osm_drains(refresh: bool) -> tuple[list[dict], str]:
    cache = RAW / "osm_drains.json"
    if cache.exists() and not refresh:
        raw = json.loads(cache.read_text())
    else:
        bb = f"({S - 0.002},{W - 0.002},{NORTH + 0.002},{EAST + 0.002})"
        q = f'[out:json][timeout:60];(way["waterway"~"^(drain|ditch|canal|stream|river)$"]{bb};);out geom tags;'
        body = urllib.parse.urlencode({"data": q}).encode()
        raw = None
        for ep in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
            try:
                raw = json.loads(http(ep, body, 90))
                break
            except Exception as exc:  # noqa: BLE001
                print(f"  overpass {ep} failed: {exc}", file=sys.stderr)
                time.sleep(2)
        if raw is None:
            raise SystemExit("Could not reach Overpass for OSM drains. Nothing was changed.")
        RAW.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(raw))
    return parse_drains(raw), raw.get("osm3s", {}).get("timestamp_osm_base", "unknown")


def parse_drains(raw: dict) -> list[dict]:
    out = []
    for el in raw.get("elements", []):
        t = el.get("tags", {})
        kind = t.get("waterway")
        geom = el.get("geometry") or []
        if el.get("type") != "way" or kind not in CHANNEL_DEPTH_M or len(geom) < 2:
            continue
        pts = [[round(x, 1), round(y, 1)] for x, y in (to_xy(g["lon"], g["lat"]) for g in geom)]
        if not any(-50 <= x <= WIDTH_M + 50 and -50 <= y <= HEIGHT_M + 50 for x, y in pts):
            continue
        out.append({"id": f"w{el['id']}", "kind": kind, "name": t.get("name") or None, "covered": "tunnel" in t or t.get("covered") == "yes", "pts": pts})
    return out


def channel_grid(drains: list[dict]) -> np.ndarray:
    """Depth (m) to cut into each 12.5 m cell along open mapped channels."""
    cut = np.zeros((NY, NX))
    for d in drains:
        if d["covered"]:
            continue
        depth = CHANNEL_DEPTH_M[d["kind"]]
        for (x0, y0), (x1, y1) in zip(d["pts"][:-1], d["pts"][1:]):
            k = max(1, int(math.hypot(x1 - x0, y1 - y0) / 2.0))
            for s in range(k + 1):
                x = x0 + (x1 - x0) * s / k; y = y0 + (y1 - y0) * s / k
                ix, iy = int(x // CELL), int(y // CELL)
                if 0 <= ix < NX and 0 <= iy < NY:
                    cut[iy, ix] = max(cut[iy, ix], depth)
    return cut


# ---------------------------------------------------------------- candidate dataset
def build_candidate(ds0: dict, samples: dict, passes: int, drains: list[dict] | None, dem_label: str, osm_ts: str) -> tuple[dict, dict]:
    ds = copy.deepcopy(ds0)
    g = ds["grid"]
    bmask = np.array(g["building_mask"]).reshape(NY, NX)
    rmask = np.array(g["road_mask"]).reshape(NY, NX)
    dem_raw = build_dem(samples, passes)
    cut = channel_grid(drains) if drains else np.zeros_like(dem_raw)
    cut[bmask.astype(bool)] = 0.0                                 # never cut under a building footprint
    dem = condition_dem(dem_raw - cut)
    for inl in ds["inlets"]:
        inl["elev"] = round(float(dem_raw[inl["iy"], inl["ix"]]), 2)
    ds["zones"] = build_zones(dem_raw, bmask, rmask, ds["buildings"], ds["roads"], ds["facilities"], ds["inlets"])
    g["dem"] = [round(float(v), 2) for v in dem.ravel()]
    ds["meta"]["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for L in ds["layers"]:
        if L["id"] == "dem" and dem_label == "glo30":
            L.update(title="Terrain elevation", source_name="Copernicus GLO-30 DEM (AWS open data)", source_url="https://registry.opendata.aws/copernicus-dem/",
                     retrieved_at=samples["retrieved_at"], native_resolution_or_scale="~30 m posting (1 arc-second)",
                     processing_method=f"{samples['n']}x{samples['n']} bilinear samples, 3x3 smoothing x{passes}, bilinear upsample to the 12.5 m grid, then priority-flood depression filling toward the lowest (downstream) edge; terrain index uses the unfilled surface. GLO-30 is a surface model (includes buildings/trees).")
    ds["layers"] = [L for L in ds["layers"] if L["id"] != "mapped_drains"]
    if drains is not None:
        ds["drains"] = drains
        n_open = sum(1 for d in drains if not d["covered"])
        ds["layers"].append(dict(
            id="mapped_drains", title=f"Drains and channels mapped in OSM ({len(drains)})", source_name="OpenStreetMap contributors (via Overpass API)",
            source_url="https://www.openstreetmap.org/", retrieved_at=osm_ts, licence_or_terms="ODbL 1.0 - (c) OpenStreetMap contributors",
            native_resolution_or_scale="vector centrelines",
            processing_method=f"waterway=drain/ditch/canal/stream/river ways near the pilot. {n_open} open ones are cut into the 12.5 m terrain as channels (assumed depths m: {CHANNEL_DEPTH_M}) before depression filling; covered ones (tunnel/covered) are display only.",
            data_status="observed",
            known_limitations="OSM drain mapping is incomplete; channel depths, widths and connections are assumptions. Not a drainage survey."))
    info = {"dem": dem_label, "drains": None if drains is None else len(drains),
            "channel_cells": int((cut > 0).sum()), "dem_range_m": [round(float(dem.min()), 2), round(float(dem.max()), 2)]}
    return ds, info


# ---------------------------------------------------------------- replay check (mirrors the Replay tab)
def report_covers(r: dict, day: str) -> bool:
    return r["event_date"] <= day <= r.get("event_end_date", r["event_date"])


def _seg_dist(px, py, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - a[0]) * dx + (py - a[1]) * dy) / L2))
    return math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))


def score_reports(ds: dict, zones_res: list[dict], reports: list[dict], day: str, radius: float = HIT_RADIUS_M) -> dict:
    """Python port of scoreReports() in frontend/src/scenarios/engine/replay.ts."""
    o, m, size = ds["meta"]["origin"], ds["meta"]["m_per_deg"], ds["meta"]["size_m"]
    flagged = [z for z, r in zip(ds["zones"]["zones"], zones_res) if r["band"] in ("higher", "highest")]
    ways = {r["id"]: r for r in ds["roads"]}
    checks, outside = [], 0
    for r in (r for r in reports if report_covers(r, day)):
        x, y = (r["lon"] - o["lon"]) * m["lon"], (r["lat"] - o["lat"]) * m["lat"]
        segs = [(p, q) for wid in r.get("osm_way_ids", []) for p, q in zip(ways.get(wid, {}).get("pts", [])[:-1], ways.get(wid, {}).get("pts", [])[1:])]
        if not segs and not (0 <= x <= size[0] and 0 <= y <= size[1]):
            outside += 1
            continue
        dist = (lambda px, py: min(_seg_dist(px, py, a, b) for a, b in segs)) if segs else (lambda px, py: math.hypot(px - x, py - y))
        best = min((dist(z["cx"], z["cy"]) for z in flagged), default=None)
        checks.append({"place": r["place_name"], "hit": best is not None and best <= radius, "nearest_flagged_m": None if best is None else round(best)})
    hits = sum(c["hit"] for c in checks)
    return {"date": day, "hits": hits, "n": len(checks), "outside": outside, "flagged": len(flagged), "checks": checks}


def replay_day(ds: dict, rain_mm: list[float], reports: list[dict], day: str) -> dict:
    from risk_scoring import evaluate, zone_water
    from risk_scoring.engine import resolve_inlet_open
    from simulation import VirtualPipeSolver, step_storm
    g = ds["grid"]
    total = round(sum(rain_mm), 1)
    sc = {"name": f"Replay {day}", "rainfall_mm": total, "duration_h": float(len(rain_mm)), "blockage_fraction": BLOCKAGE, "overrides": {}, "pumps": False}
    open_ = resolve_inlet_open(ds["inlets"], BLOCKAGE, {})
    inl = [(i["iy"], i["ix"], o) for i, o in zip(ds["inlets"], open_)]
    s = VirtualPipeSolver(np.array(g["dem"]).reshape(NY, NX), np.array(g["building_mask"]).reshape(NY, NX), np.array(g["road_mask"]).reshape(NY, NX),
                          g["cell_m"], inl, [], total, float(len(rain_mm)), 3.0, storm=step_storm(rain_mm, 1.0))
    s.run()
    peak = np.round(s.peak * 1000) / 1000                      # the app sees whole-mm snapshots
    res = evaluate(ds, sc, water=zone_water(ds, peak))
    out = score_reports(ds, res["zones"], reports, day)
    out["rain_mm"] = total
    return out


def report_days(ds: dict, reports: list[dict]) -> list[str]:
    """Every day covered by at least one report inside the pilot (a report can span several days)."""
    from datetime import timedelta
    days, dummy = set(), [{"band": "lower"}] * len(ds["zones"]["zones"])
    for r in reports:
        d, end = date.fromisoformat(r["event_date"]), date.fromisoformat(r.get("event_end_date", r["event_date"]))
        while d <= end:
            if score_reports(ds, dummy, [r], d.isoformat())["n"]:
                days.add(d.isoformat())
            d += timedelta(days=1)
    return sorted(days)


def compare(ds0: dict, ds1: dict, today: date) -> list[dict]:
    from services.replay import replay_rain
    reports = json.loads((VALIDATION / "observed_waterlogging.json").read_text())["reports"]
    lat, lon = (S + NORTH) / 2, (W + EAST) / 2
    rows = []
    for day in report_days(ds0, reports):
        try:
            rain = replay_rain(lat, lon, date.fromisoformat(day), today)["series"]["actual"]
        except Exception as exc:  # noqa: BLE001
            print(f"  {day}: no actual rain ({exc}); skipped", file=sys.stderr)
            continue
        print(f"  replaying {day} ({sum(rain):.1f} mm) on the current and the candidate dataset ...", flush=True)
        rows.append({"date": day, "current": replay_day(ds0, rain, reports, day), "candidate": replay_day(ds1, rain, reports, day)})
    return rows


# ---------------------------------------------------------------- output
def write_dataset(ds: dict) -> None:
    txt = json.dumps(ds, separators=(",", ":"))
    (PROCESSED / f"{AREA_ID}.json").write_text(txt)
    (WEB_PUBLIC / f"{AREA_ID}.json").write_text(txt)
    lines = ["# Generated by gis-engine (build_pilot_dataset.py / upgrade_pilot.py) - provenance for every layer", "layers:"]
    for L in ds["layers"]:
        lines.append(f"  - id: {L['id']}")
        for k, v in L.items():
            if k != "id":
                lines.append(f"    {k}: {json.dumps(v, ensure_ascii=False)}")
    (PROCESSED / "layers.yaml").write_text("\n".join(lines) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dem", choices=["glo90", "glo30"], default="glo30")
    ap.add_argument("--drains", action="store_true", help="cut OSM-mapped open drains/channels into the terrain")
    ap.add_argument("--apply", action="store_true", help="write the dataset (otherwise nothing in the repo changes)")
    ap.add_argument("--no-replay", action="store_true")
    ap.add_argument("--refresh", action="store_true", help="re-download cached inputs")
    a = ap.parse_args(argv)

    ds0 = json.loads((PROCESSED / f"{AREA_ID}.json").read_text())
    print(f"Terrain: {a.dem} ...", flush=True)
    samples = fetch_glo30_samples(a.refresh) if a.dem == "glo30" else fetch_dem_samples(a.refresh)
    drains, osm_ts = (None, "")
    if a.drains:
        print("OSM drains ...", flush=True)
        drains, osm_ts = fetch_osm_drains(a.refresh)
        print(f"  {len(drains)} mapped drains/channels ({sum(not d['covered'] for d in drains)} open)")
    ds1, info = build_candidate(ds0, samples, 1 if a.dem == "glo30" else 2, drains, a.dem, osm_ts)
    print(f"  candidate: {info}")

    result = {"run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "options": vars(a), "candidate": info, "days": []}
    if not a.no_replay:
        result["days"] = compare(ds0, ds1, date.today())
        print("\n  date        rain    current   candidate   (hits / reports inside the pilot; flagged zones)")
        for r in result["days"]:
            c, n = r["current"], r["candidate"]
            print(f"  {r['date']}  {c['rain_mm']:5.1f} mm   {c['hits']}/{c['n']} ({c['flagged']})   {n['hits']}/{n['n']} ({n['flagged']})")
        VALIDATION.mkdir(parents=True, exist_ok=True)
        (VALIDATION / "upgrade_check.json").write_text(json.dumps(result, indent=1) + "\n")
        print(f"\n  wrote {VALIDATION / 'upgrade_check.json'}")
    if a.apply:
        write_dataset(ds1)
        print(f"Wrote the new dataset to {PROCESSED / (AREA_ID + '.json')} and the frontend copy.")
        print("Next: make derived   (rebuilds the baseline water and the parity references), then make test")
    else:
        print("Nothing written (add --apply to keep the candidate).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
