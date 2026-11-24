"""Data-quality report for the pilot dataset.

Reads data/processed/pilot_kakinada_01.json and writes docs/data-quality.md: how much data the app really has, what
each number rests on, and what that means for the scores. Every figure is computed from the dataset, so the report
stays honest when the dataset is rebuilt.

    python gis-engine/data_quality.py            # rewrite docs/data-quality.md
    python gis-engine/data_quality.py --print    # print instead of writing

Standard library + numpy only; no network.
"""
from __future__ import annotations

import json
import math
import sys
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "data" / "processed" / "pilot_kakinada_01.json"
REPORT = ROOT / "docs" / "data-quality.md"

DEM_LATTICE = 21          # gis-engine/terrain/dem.py samples the elevation service on a 21 x 21 lattice
INLET_CAP = 56            # gis-engine/processing/osm.py place_inlets(max_n=56)
INLET_REACH_M = 250       # an inlet only counts for a zone within this distance (risk engine)
ACCESS_RADII_M = (400, 800)
FLAT_SLOPE = 0.001        # 0.1 %


# ---------------------------------------------------------------- geometry helpers
def polygon_area(ring: list[list[float]]) -> float:
    """Shoelace area of a ring in square metres (the ring may or may not repeat its first point)."""
    a = 0.0
    for i in range(len(ring)):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % len(ring)]
        a += x0 * y1 - x1 * y0
    return abs(a) / 2


def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def road_length_m(road: dict) -> float:
    return sum(math.hypot(x1 - x0, y1 - y0) for (x0, y0), (x1, y1) in zip(road["pts"][:-1], road["pts"][1:]))


def largest_component_share(ds: dict) -> tuple[int, float]:
    """(nodes that lie on a road, share of them in the largest connected piece of the road network)."""
    nodes = ds["road_nodes"]
    adj: dict[str, list[str]] = {}
    for r in ds["roads"]:
        ids = r["nodes"]
        for a, b in zip(ids[:-1], ids[1:]):
            if a != b and a in nodes and b in nodes:
                adj.setdefault(a, []).append(b)
                adj.setdefault(b, []).append(a)
    seen: set[str] = set()
    best = 0
    for start in adj:
        if start in seen:
            continue
        stack, size = [start], 0
        seen.add(start)
        while stack:
            u = stack.pop()
            size += 1
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        best = max(best, size)
    return len(adj), (best / len(adj) if adj else 0.0)


def share_within(zones: list[dict], points: list[tuple[float, float]], radius: float) -> float:
    if not zones:
        return 0.0
    hit = sum(1 for z in zones if any(math.hypot(z["cx"] - x, z["cy"] - y) <= radius for x, y in points))
    return hit / len(zones)


# ---------------------------------------------------------------- metrics
def compute_metrics(ds: dict) -> dict:
    g = ds["grid"]
    nx, ny, cell = g["nx"], g["ny"], g["cell_m"]
    area_m2 = nx * ny * cell * cell
    area_km2 = area_m2 / 1e6
    zones = ds["zones"]["zones"]
    nz = len(zones)

    dem = np.array(g["dem"], dtype=float).reshape(ny, nx)
    gy, gx = np.gradient(dem, cell)
    slope = np.hypot(gx, gy)
    edges = {"west": dem[:, 0], "east": dem[:, -1], "south": dem[0, :], "north": dem[-1, :]}
    w_m, h_m = ds["meta"]["size_m"]

    b_area = sum(polygon_area(b["ring"]) for b in ds["buildings"])
    n_b = len(ds["buildings"])
    road_m = sum(road_length_m(r) for r in ds["roads"])
    graph_nodes, graph_share = largest_component_share(ds)
    water_area = sum(polygon_area(w["ring"]) for w in ds["water"])
    empty = [z for z in zones if z["n_buildings"] == 0 and z["road_m"] == 0]
    in_water = [z for z in empty if any(point_in_ring(z["cx"], z["cy"], w["ring"]) for w in ds["water"])]

    fac = ds["facilities"]
    by_cat: dict[str, list[tuple[float, float]]] = {}
    for f in fac:
        by_cat.setdefault(f["category"], []).append((f["x"], f["y"]))

    inl = ds["inlets"]
    nn = []
    for i, a in enumerate(inl):
        nn.append(min((math.hypot(a["x"] - b["x"], a["y"] - b["y"]) for j, b in enumerate(inl) if j != i), default=0.0))

    return {
        "meta": {"area_id": ds["meta"]["area_id"], "name": ds["meta"]["name"], "generated_at": ds["meta"]["generated_at"]},
        "grid": {"nx": nx, "ny": ny, "cell_m": cell, "area_km2": area_km2, "size_m": [w_m, h_m]},
        "terrain": {
            "min_m": float(dem.min()), "max_m": float(dem.max()), "relief_m": float(dem.max() - dem.min()), "std_m": float(dem.std()),
            "unique_values": int(len(np.unique(dem))),
            "mean_slope_pct": float(slope.mean() * 100), "flat_share": float((slope < FLAT_SLOPE).mean()),
            "posting_m": [w_m / (DEM_LATTICE - 1), h_m / (DEM_LATTICE - 1)], "samples": DEM_LATTICE * DEM_LATTICE,
            "edge_mean_m": {k: float(v.mean()) for k, v in edges.items()},
            "outfall_edge": min(edges, key=lambda k: float(edges[k].mean())),
        },
        "buildings": {
            "count": n_b, "per_km2": n_b / area_km2, "footprint_share": b_area / area_m2,
            "mean_footprint_m2": b_area / n_b if n_b else 0.0, "height_sources": dict(Counter(b["h_src"] for b in ds["buildings"])),
            "height_min_m": min((b["h"] for b in ds["buildings"]), default=0.0), "height_max_m": max((b["h"] for b in ds["buildings"]), default=0.0),
            "zones_with_none": sum(1 for z in zones if z["n_buildings"] == 0),
        },
        "roads": {
            "ways": len(ds["roads"]), "km": road_m / 1000, "km_per_km2": road_m / 1000 / area_km2,
            "classes": dict(Counter(r["cls"] for r in ds["roads"]).most_common()), "named": sum(1 for r in ds["roads"] if r["name"]),
            "nodes": len(ds["road_nodes"]), "graph_nodes": graph_nodes, "largest_component_share": graph_share,
            "mask_share": float(np.mean(g["road_mask"])), "zones_with_none": sum(1 for z in zones if z["road_m"] == 0),
        },
        "water": {"polygons": len(ds["water"]), "area_share": water_area / area_m2, "empty_zones_in_water": len(in_water)},
        "facilities": {
            "count": len(fac), "by_category": dict(Counter(f["category"] for f in fac)), "by_amenity": dict(Counter(f["amenity"] for f in fac).most_common()),
            "zones_with_any": sum(1 for z in zones if sum(z["facilities"].values()) > 0),
            "access": {cat: {int(r): share_within(zones, pts, r) for r in ACCESS_RADII_M} for cat, pts in sorted(by_cat.items())},
        },
        "drainage": {
            "inlets": len(inl), "cap": INLET_CAP, "per_km2": len(inl) / area_km2, "status": sorted({i["status"] for i in inl}),
            "mean_nearest_inlet_m": float(np.mean(nn)) if nn else 0.0,
            "zones_without_inlet": sum(1 for z in zones if not z["inlets"]), "reach_m": INLET_REACH_M,
        },
        "zones": {
            "count": nz, "size_m": ds["zones"]["size_m"], "empty": len(empty), "exposure_zero": sum(1 for z in zones if z["exposure"] == 0),
            "terrain_zero": sum(1 for z in zones if z["terrain"] == 0),
        },
        "layers": [{k: l.get(k, "") for k in ("id", "data_status", "source_name", "native_resolution_or_scale", "retrieved_at")} for l in ds["layers"]],
    }


# ---------------------------------------------------------------- report
def pct(x: float, nd: int = 0) -> str:
    return f"{100 * x:.{nd}f}%"


def of(n: int, total: int) -> str:
    return f"{n} of {total} ({pct(n / total) if total else '0%'})"


def render_markdown(m: dict) -> str:
    g, t, b, r, w, f, d, z = (m[k] for k in ("grid", "terrain", "buildings", "roads", "water", "facilities", "drainage", "zones"))
    nz = z["count"]
    placeholder = b["height_sources"].get("default_proxy", 0)
    acc = f["access"]
    L: list[str] = []
    add = L.append

    add("# Data quality report")
    add("")
    add(f"*{m['meta']['name']}.* Dataset built **{m['meta']['generated_at']}**. This file is generated by `gis-engine/data_quality.py`: "
        "every number is computed from `data/processed/pilot_kakinada_01.json`, so rerun the script after rebuilding the dataset. "
        "The sentences that say what a number means are written by hand and are a judgement, not a measurement.")
    add("")
    add("## In one page")
    add("")
    add("| Layer | What we have | Assessment |")
    add("|---|---|---|")
    add(f"| Terrain | {t['samples']} integer-metre elevation samples, about {t['posting_m'][0]:.0f} m apart, smoothed and resampled to {g['cell_m']:g} m cells. "
        f"Total relief is {t['relief_m']:.1f} m. | **Limited.** The source's 1 m steps are {pct(1 / t['relief_m'])} of the whole relief. |")
    add(f"| Buildings | {b['count']} footprints ({b['per_km2']:.0f} per km²), covering {pct(b['footprint_share'], 1)} of the area. "
        f"{placeholder} of {b['count']} heights are placeholders. | **Limited.** Likely incomplete, and heights are not data. |")
    add(f"| Roads | {r['ways']} ways, {r['km']:.1f} km ({r['km_per_km2']:.1f} km per km²); {pct(r['largest_component_share'], 1)} of road nodes are in one connected network. | **Usable** for the pilot. |")
    add(f"| Facilities | {f['count']} points ({', '.join(f'{v} {k}' for k, v in sorted(f['by_category'].items()))}). | **Limited.** Small sample, and the \"shelter\" class is an assumption (see below). |")
    add(f"| Drains | {d['inlets']} proxy inlets, spread evenly along roads, capped at {d['cap']}. | **Placeholder.** No drainage data exists in this dataset. |")
    add("| Rainfall | A user-chosen scenario, uniform over the area. | **Assumed**, by design. |")
    add("")
    add("**The main point:** the app treats missing data as \"nothing there\". Where the map data is thin, exposure and imperviousness read as zero, "
        "so a quiet-looking zone may only be an unmapped one. Low scores are not evidence of safety.")
    add("")

    add("## Terrain")
    add("")
    add(f"- Source: Copernicus GLO-90, a *surface* model (it includes buildings and trees), read through a public elevation service on a {DEM_LATTICE} × {DEM_LATTICE} lattice, "
        f"so about {t['posting_m'][0]:.0f} m × {t['posting_m'][1]:.0f} m between samples. Values are whole metres.")
    add(f"- Processing: two light smoothing passes, bilinear resampling to {g['nx']} × {g['ny']} cells of {g['cell_m']:g} m, then filling of pits so water can reach the outlet. "
        f"The {t['unique_values']} distinct heights in the grid come from interpolating whole-metre samples, not from finer measurement.")
    add(f"- Range {t['min_m']:.2f} to {t['max_m']:.2f} m (relief {t['relief_m']:.1f} m, standard deviation {t['std_m']:.2f} m). Mean slope {t['mean_slope_pct']:.2f}%; "
        f"{pct(t['flat_share'])} of cells are flatter than {FLAT_SLOPE * 100:.1f}%.")
    em = t["edge_mean_m"]
    add(f"- Mean height of each map edge: " + ", ".join(f"{k} {v:.2f} m" for k, v in em.items()) + f". The solver sends water out through the lowest one (**{t['outfall_edge']}**). "
        "That is an assumption about where drainage leaves the area; no tide, surge or river level is modelled.")
    add(f"- What it means: street-scale features (kerbs, culverts, underpasses, raised plinths) are invisible, and a 1 m step is {pct(1 / t['relief_m'])} of the whole area's relief. "
        f"Zones are {z['size_m']:g} m wide but the samples are about {t['posting_m'][0]:.0f} m apart, so neighbouring zones get nearly the same interpolated height.")
    add("")

    add("## Buildings")
    add("")
    add(f"- {b['count']} footprints from OpenStreetMap: {b['per_km2']:.0f} per km², covering {pct(b['footprint_share'], 1)} of the area, mean footprint {b['mean_footprint_m2']:.0f} m².")
    add(f"- Heights: {', '.join(f'{v} from `{k}`' for k, v in b['height_sources'].items())}. "
        f"A `default_proxy` height is a deterministic 2 to 4 storeys per building ({b['height_min_m']:.1f} to {b['height_max_m']:.1f} m here). It is used for the 3D picture and is **not** survey data.")
    add(f"- Zones with no mapped building: {of(b['zones_with_none'], nz)}.")
    add("- What it means: a footprint density this low is unusual for a town core, which suggests many buildings are not mapped. "
        "This has **not** been checked against another source. To check it, count buildings in the same box from satellite imagery or an open footprint dataset and compare.")
    add("")

    add("## Roads")
    add("")
    add(f"- {r['ways']} ways, {r['km']:.1f} km in total ({r['km_per_km2']:.1f} km per km²); classes: " + ", ".join(f"{k} {v}" for k, v in r["classes"].items()) + f". {r['named']} have a name.")
    add(f"- Network: {r['nodes']} nodes, {r['graph_nodes']} of them on a road. {pct(r['largest_component_share'], 1)} are in the largest connected piece, so routing between facilities mostly works.")
    add(f"- Road cells cover {pct(r['mask_share'], 1)} of the grid (centrelines widened to an assumed road width). Zones with no road: {of(r['zones_with_none'], nz)}.")
    add("")

    add("## Water bodies")
    add("")
    add(f"- {w['polygons']} mapped water polygons covering {pct(w['area_share'], 1)} of the area. Of the zones with neither a building nor a road (see Zones), {w['empty_zones_in_water']} have their centre in mapped water.")
    add("")

    add("## Facilities")
    add("")
    add(f"- {f['count']} points: " + ", ".join(f"{v} {k}" for k, v in f["by_amenity"].items()) + ".")
    add(f"- Zones containing at least one facility: {of(f['zones_with_any'], nz)}.")
    add("- Share of zone centres within a straight-line distance of the nearest facility of each kind:")
    add("")
    add("| Kind | within " + " | within ".join(f"{r} m" for r in ACCESS_RADII_M) + " |")
    add("|---|" + "---|" * len(ACCESS_RADII_M))
    for cat, v in acc.items():
        add(f"| {cat} | " + " | ".join(pct(v[r_]) for r_ in ACCESS_RADII_M) + " |")
    add("")
    add("- What it means: with so few points, one missing hospital or shelter changes the exposure map and the routes noticeably. "
        "The \"shelter\" class is built from schools, town halls and places of worship by assumption; none of these is a verified evacuation shelter.")
    add("")

    add("## Drains")
    add("")
    add(f"- {d['inlets']} inlets, all with status {', '.join(f'`{s}`' for s in d['status'])}. They are placed by even spacing along roads and **stop at a cap of {d['cap']}**, so this count is a setting, not a finding.")
    add(f"- Density {d['per_km2']:.0f} per km², mean distance to the nearest other inlet {d['mean_nearest_inlet_m']:.0f} m.")
    add(f"- Zones with no inlet within {d['reach_m']} m: {of(d['zones_without_inlet'], nz)}. These score as having zero drainage capacity whatever blockage is chosen (a mitigation pump placed nearby is the only thing that adds any).")
    add("- What it means: \"blockage\" scenarios switch off proxy points, not real drains. The drainage part of the score illustrates sensitivity until a real inventory replaces these points.")
    add("")

    add("## Zones")
    add("")
    add(f"- {nz} zones of {z['size_m']:g} m. Zones with neither a mapped building nor a road: {of(z['empty'], nz)}. Zones whose exposure is exactly zero: {of(z['exposure_zero'], nz)}.")
    add("- What it means: exposure is rescaled between the least and the most built-up zone in this one area. It says which zones are *relatively* exposed here, and says nothing about other places or about absolute risk.")
    add("")

    add("## Layer provenance")
    add("")
    add("| Layer | Status | Source | Resolution | Retrieved |")
    add("|---|---|---|---|---|")
    for l in m["layers"]:
        add(f"| {l['id']} | {l['data_status']} | {l['source_name']} | {l['native_resolution_or_scale']} | {l['retrieved_at'][:10] or '-'} |")
    add("")

    add("## What would improve the data most")
    add("")
    add("1. **A real drain inventory** from the municipality: it turns the proxy layer into data and makes blockage scenarios meaningful.")
    add("2. **A building-count check** against satellite imagery or an open footprint dataset, and gap-filling where the map is thin.")
    add("3. **Better terrain**: LiDAR or drone survey, or at least a bare-earth model with finer posting.")
    add("4. **A verified shelter and facility list** from the district administration.")
    add("5. **One recorded flood event** with an observed flooded extent, to test the model against.")
    add("")
    return "\n".join(L).rstrip() + "\n"        # exactly one newline at the end of the file


def main(argv: list[str]) -> int:
    ds = json.loads(DATASET.read_text(encoding="utf-8"))
    text = render_markdown(compute_metrics(ds))
    if "--print" in argv:
        sys.stdout.buffer.write(text.encode("utf-8"))
    else:
        REPORT.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {REPORT.relative_to(ROOT)} ({len(text.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
