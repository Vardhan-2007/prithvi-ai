"""Diagnosis: where do the reported-flooded places sit in the terrain data, and where does the model say it floods?

Reads the pilot dataset and the observed waterlogging reports, then prints four tables (see docs/validation-diagnosis.md):
  A. the height percentile of each reported place inside the pilot
  B. the zones the model flags (final, water-based score) for two example storms, and the distance to each reported place
  C. simple terrain rules ("flag the lowest N% of zones") as a baseline
  D. the model's own flag counts against blind guessing (same number of zones picked at random, fixed seed)

    python gis-engine/validation_diagnosis.py            # all tables (runs the flood solver twice, about 30 s)
    python gis-engine/validation_diagnosis.py --no-sim   # tables A and C only (instant)

The two example storms are scenarios of similar size to the real ones, not the Replay tab's runs.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
HIT_RADIUS_M = 150          # same rule as frontend/src/scenarios/engine/replay.ts
BLOCKAGE = 0.25             # same default as the live replays
STORMS = {"100 mm / 6 h": dict(value=100, duration_hours=6), "55 mm / 12 h": dict(value=55, duration_hours=12)}
LOWEST_SHARES = (0.05, 0.10, 0.20, 0.30, 0.50)
DRAWS, SEED = 3000, 7


def load(path: str) -> dict:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def percentile_below(values: np.ndarray, v: float) -> float:
    """Share of `values` that are lower than v, in percent (0 = the lowest ground, 100 = higher than everything)."""
    return 100.0 * float((values < v).mean())


def places_in_pilot(ds: dict, obs: dict) -> dict[str, dict]:
    """Distinct reported places inside the pilot: {name: {"pts": [(x, y) ...], "n": reports, "dates": [...]}}.
    A report that names whole streets (osm_way_ids) contributes every vertex of those streets; otherwise its point."""
    m = ds["meta"]
    ox, oy = m["origin"]["lon"], m["origin"]["lat"]
    ml, mt = m["m_per_deg"]["lon"], m["m_per_deg"]["lat"]
    w, h = m["size_m"]
    roads = {r["id"]: r for r in ds["roads"]}
    places: dict[str, dict] = {}
    for r in obs["reports"]:
        x, y = (r["lon"] - ox) * ml, (r["lat"] - oy) * mt
        if not (0 <= x < w and 0 <= y < h):
            continue
        name = r["place_name"].split(",")[0]
        if name.startswith("Cinema"):                       # "Cinema Street" (Nov) and "Cinema Road" (Jun) are the same pin
            name = "Cinema Street/Road"
        pts = [tuple(p) for wid in r.get("osm_way_ids") or [] if wid in roads for p in roads[wid]["pts"]] or [(x, y)]
        p = places.setdefault(name, {"pts": [], "pins": [], "n": 0, "dates": []})
        p["pts"] += pts
        p["pins"].append((x, y))                            # the reported spot itself
        p["n"] += 1
        p["dates"].append(r["event_date"])
    return places


def nearest_m(zone_list: list[dict], pts: list[tuple[float, float]]) -> float:
    return min(math.hypot(z["cx"] - px, z["cy"] - py) for z in zone_list for (px, py) in pts)


def hits(zone_list: list[dict], places: dict[str, dict]) -> int:
    return sum(1 for p in places.values() if nearest_m(zone_list, p["pts"]) <= HIT_RADIUS_M)


def blind_guess(zones: list[dict], places: dict[str, dict], k: int, draws: int = DRAWS, seed: int = SEED) -> tuple[float, float]:
    """(mean hits, share of draws with zero hits) when k zones are flagged at random."""
    rng = np.random.default_rng(seed)
    total, zero = [], 0
    for _ in range(draws):
        pick = [zones[i] for i in rng.choice(len(zones), size=k, replace=False)]
        h = hits(pick, places)
        total.append(h)
        zero += h == 0
    return float(np.mean(total)), zero / draws


def table_a(ds: dict, places: dict[str, dict]) -> list[str]:
    g = ds["grid"]
    nx, ny, cell = g["nx"], g["ny"], g["cell_m"]
    dem = np.array(g["dem"]).reshape(ny, nx)
    wall = np.array(g["building_mask"]).reshape(ny, nx).astype(bool)
    zones = ds["zones"]["zones"]
    zs, nzx = ds["zones"]["size_m"], ds["zones"]["nx"]
    raw = np.array([z["mean_elev"] for z in zones])           # unfilled terrain, as the zone scores use
    terr = np.array([z["terrain"] for z in zones])
    nzy = len(zones) // nzx
    zone_at = lambda x, y: min(nzy - 1, int(y // zs)) * nzx + min(nzx - 1, int(x // zs))
    rows = [f"{'place':22s} {'reports':>7s} {'at the pin: height pct':>23s} {'whole street: zones':>20s} {'height pct (mean, range)':>26s} {'terrain-risk pct':>17s}"]
    for name, p in places.items():
        pin = [percentile_below(raw, zones[zone_at(x, y)]["mean_elev"]) for x, y in p["pins"]]
        idx = sorted({zone_at(x, y) for x, y in p["pts"]})        # every zone the reported street(s) touch
        hp = [percentile_below(raw, zones[i]["mean_elev"]) for i in idx]
        tp = [percentile_below(terr, zones[i]["terrain"]) for i in idx]
        rows.append(f"{name:22s} {p['n']:7d} {np.mean(pin):22.0f}% {len(idx):20d} {np.mean(hp):9.0f}%  ({min(hp):.0f}% to {max(hp):.0f}%)".ljust(98)
                    + f"{np.mean(tp):6.0f}%")
    return rows


def table_c(ds: dict, places: dict[str, dict]) -> list[str]:
    zones = ds["zones"]["zones"]
    order = np.argsort([z["mean_elev"] for z in zones])
    rows = []
    for share in LOWEST_SHARES:
        k = max(1, round(share * len(zones)))
        low = [zones[i] for i in order[:k]]
        rows.append(f"lowest {int(share * 100):2d}% of zones ({k:3d}): {hits(low, places)} of {len(places)} places hit")
    return rows


def flagged_for_storm(body: dict) -> list[str]:
    """Zones the final (water-based) score puts in the Higher or Highest band, via the backend API in-process."""
    sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "ai-engine")]
    from fastapi.testclient import TestClient
    from main import app
    c = TestClient(app, raise_server_exceptions=False)
    r = c.post("/api/v1/scenarios", json={"rainfall_scenario": body, "drainage_blockage_fraction": BLOCKAGE, "simulate": True}, timeout=300)
    if r.status_code != 201:
        raise SystemExit(f"scenario failed: {r.status_code} {r.text[:200]}")
    feats = c.get(f"/api/v1/scenarios/{r.json()['scenario_id']}/geojson").json()["features"]
    key = next(k for k in feats[0]["properties"] if "band" in k)
    idkey = "zone_id" if "zone_id" in feats[0]["properties"] else "id"
    return [f["properties"][idkey] for f in feats if f["properties"][key] in ("higher", "highest")]


def tables_b_d(ds: dict, places: dict[str, dict]) -> list[str]:
    zones = ds["zones"]["zones"]
    by_id = {z["id"]: z for z in zones}
    heights = np.array([z["mean_elev"] for z in zones])
    out, flagged_sets = [], {}
    for label, body in STORMS.items():
        fl = flagged_for_storm(body)
        flagged_sets[label] = fl
        zs = [by_id[i] for i in fl]
        hs = np.array([z["mean_elev"] for z in zs])
        out.append(f"{label}: {len(fl)} zones flagged | mean height {hs.mean():.2f} m (pilot zone mean {heights.mean():.2f} m) | "
                   f"height percentile of each flagged zone: {sorted(round(percentile_below(heights, h)) for h in hs)}")
        for name, p in places.items():
            out.append(f"    {name:22s} nearest flagged zone centre: {nearest_m(zs, p['pts']):6.0f} m")
    sets = [set(v) for v in flagged_sets.values()]
    out.append(f"zones flagged in both storms: {len(sets[0] & sets[1])} (of {len(sets[0])} and {len(sets[1])})")
    out.append("")
    out.append(f"D. blind guessing: the same number of zones picked at random ({DRAWS} draws, seed {SEED}); a hit is a flagged zone centre within {HIT_RADIUS_M} m")
    for label, fl in flagged_sets.items():
        zs = [by_id[i] for i in fl]
        mean_hits, zero = blind_guess(zones, places, len(fl))
        out.append(f"{label}: model flags {len(fl)} zones -> {hits(zs, places)} of {len(places)} places | blind guess: mean {mean_hits:.2f} hits, zero hits in {100 * zero:.0f}% of draws")
    return out


def main(argv: list[str]) -> int:
    ds, obs = load("data/processed/pilot_kakinada_01.json"), load("data/validation/observed_waterlogging.json")
    places = places_in_pilot(ds, obs)
    print(f"dataset built {ds['meta']['generated_at']} | {len(obs['reports'])} reports, {sum(p['n'] for p in places.values())} inside the pilot, {len(places)} distinct places")
    print("\nA. where the reported places sit in the terrain data (percentile = share of the pilot that is LOWER; 0 = lowest ground)")
    print("\n".join(table_a(ds, places)))
    print("\nC. simple terrain rule: flag the lowest N% of zones by height; a hit is a flagged zone centre within 150 m of the place")
    print("\n".join(table_c(ds, places)))
    if "--no-sim" not in argv:
        print(f"\nB. zones the model flags (final score, {int(BLOCKAGE * 100)}% drains blocked) and the distance to each place")
        print("\n".join(tables_b_d(ds, places)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
