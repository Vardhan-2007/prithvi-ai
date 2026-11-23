"""Tests for gis-engine/data_quality.py (the data-quality report generator)."""
import json
import math
from pathlib import Path

import pytest

import data_quality as dq

ROOT = Path(__file__).resolve().parents[2]
SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]]


def shifted(ring, dx, dy):
    return [[x + dx, y + dy] for x, y in ring]


def toy():
    """A 4 x 4 cell grid (10 m cells, a ramp rising 1 m per cell to the east) with 2 x 2 zones of 20 m."""
    zones = []
    for n, (cx, cy) in enumerate([(10, 10), (30, 10), (10, 30), (30, 30)]):
        zones.append(dict(id=f"zone_{n:03d}", cx=cx, cy=cy, n_buildings=2 if n == 0 else 0, road_m=20.0 if n == 0 else 0.0,
                          facilities={"health": 1 if n == 0 else 0, "emergency": 0, "shelter": 0},
                          inlets=[[0, 1.0]] if n == 0 else [], exposure=0.7 if n == 0 else 0.0, terrain=0.5))
    return {
        "meta": {"area_id": "toy", "name": "Toy area", "generated_at": "2000-01-01T00:00:00+00:00", "size_m": [40.0, 40.0]},
        "grid": {"nx": 4, "ny": 4, "cell_m": 10.0, "dem": [float(x) for _ in range(4) for x in range(4)],
                 "building_mask": [0] * 16, "road_mask": [1, 1, 1, 0] + [0] * 12},
        "buildings": [{"id": "b1", "h": 6.4, "h_src": "default_proxy", "ring": SQUARE}, {"id": "b2", "h": 9.0, "h_src": "osm_tag", "ring": shifted(SQUARE, 20, 20)}],
        "roads": [{"id": "r1", "cls": "residential", "name": "A Road", "nodes": ["A", "B", "C"], "pts": [[0, 0], [10, 0], [20, 0]]},
                  {"id": "r2", "cls": "service", "name": None, "nodes": ["D", "E"], "pts": [[30, 30], [40, 30]]}],
        "road_nodes": {"A": [0, 0], "B": [10, 0], "C": [20, 0], "D": [30, 30], "E": [40, 30]},
        "facilities": [{"id": "f1", "amenity": "hospital", "category": "health", "name": "H", "x": 10, "y": 10}],
        "water": [{"id": "w1", "ring": shifted(SQUARE, 25, 5)}],       # covers the centre (30, 10) of zone_001
        "inlets": [{"id": "i1", "x": 5, "y": 5, "status": "proxy"}, {"id": "i2", "x": 8, "y": 9, "status": "proxy"}],
        "zones": {"nx": 2, "ny": 2, "size_m": 20.0, "wref": 1.0, "zones": zones},
        "layers": [{"id": "dem", "data_status": "derived", "source_name": "S", "native_resolution_or_scale": "90 m", "retrieved_at": "2026-01-01T00:00:00"}],
    }


# ---------------------------------------------------------------- helpers
def test_polygon_area_handles_either_winding_and_a_closing_point():
    assert dq.polygon_area(SQUARE) == pytest.approx(100)
    assert dq.polygon_area(SQUARE[::-1]) == pytest.approx(100)
    assert dq.polygon_area(SQUARE + [SQUARE[0]]) == pytest.approx(100)


def test_point_in_ring():
    assert dq.point_in_ring(5, 5, SQUARE)
    assert not dq.point_in_ring(15, 5, SQUARE)
    assert not dq.point_in_ring(-1, -1, SQUARE)


def test_road_length_adds_up_segments():
    assert dq.road_length_m({"pts": [[0, 0], [3, 4], [3, 10]]}) == pytest.approx(11)


def test_largest_component_share_ignores_broken_references():
    ds = toy()
    ds["roads"].append({"id": "bad", "nodes": ["A", "missing"], "pts": []})
    nodes, share = dq.largest_component_share(ds)
    assert nodes == 5 and share == pytest.approx(3 / 5)      # A-B-C is three nodes, D-E is two


# ---------------------------------------------------------------- metrics on the toy area (every value worked out by hand)
def test_metrics_on_a_toy_area():
    m = dq.compute_metrics(toy())
    assert m["grid"]["area_km2"] == pytest.approx(0.0016)
    t = m["terrain"]
    assert (t["min_m"], t["max_m"], t["relief_m"]) == (0, 3, 3)
    assert t["mean_slope_pct"] == pytest.approx(10.0) and t["flat_share"] == 0
    assert t["outfall_edge"] == "west"                      # the west edge is the lowest
    b = m["buildings"]
    assert b["count"] == 2 and b["footprint_share"] == pytest.approx(200 / 1600)
    assert b["height_sources"] == {"default_proxy": 1, "osm_tag": 1} and b["zones_with_none"] == 3
    r = m["roads"]
    assert r["ways"] == 2 and r["km"] == pytest.approx(0.03) and r["largest_component_share"] == pytest.approx(3 / 5)
    assert r["mask_share"] == pytest.approx(3 / 16) and r["zones_with_none"] == 3
    assert m["water"]["polygons"] == 1 and m["water"]["area_share"] == pytest.approx(100 / 1600)
    assert m["water"]["empty_zones_in_water"] == 1          # zone_001 is empty and its centre is in the water
    f = m["facilities"]
    assert f["count"] == 1 and f["zones_with_any"] == 1
    assert f["access"]["health"][400] == 1.0                 # every zone centre is within 28 m of the hospital
    d = m["drainage"]
    assert d["inlets"] == 2 and d["status"] == ["proxy"] and d["zones_without_inlet"] == 3
    assert d["mean_nearest_inlet_m"] == pytest.approx(math.hypot(3, 4))
    z = m["zones"]
    assert (z["count"], z["empty"], z["exposure_zero"]) == (4, 3, 3)


def test_empty_collections_do_not_crash():
    ds = toy()
    ds.update(buildings=[], roads=[], road_nodes={}, facilities=[], water=[], inlets=[])
    m = dq.compute_metrics(ds)
    assert m["buildings"]["count"] == 0 and m["buildings"]["mean_footprint_m2"] == 0
    assert m["roads"]["largest_component_share"] == 0 and m["drainage"]["mean_nearest_inlet_m"] == 0
    assert "# Data quality report" in dq.render_markdown(m)


# ---------------------------------------------------------------- the real dataset and the committed report
DS = json.loads((ROOT / "data" / "processed" / "pilot_kakinada_01.json").read_text(encoding="utf-8"))


def test_real_metrics_agree_with_the_raw_counts():
    m = dq.compute_metrics(DS)
    assert m["buildings"]["count"] == len(DS["buildings"])
    assert m["roads"]["ways"] == len(DS["roads"])
    assert m["facilities"]["count"] == len(DS["facilities"])
    assert m["drainage"]["inlets"] == len(DS["inlets"])
    assert m["zones"]["count"] == len(DS["zones"]["zones"])
    for share in (m["buildings"]["footprint_share"], m["roads"]["largest_component_share"], m["roads"]["mask_share"], m["water"]["area_share"], m["terrain"]["flat_share"]):
        assert 0 <= share <= 1
    assert sum(m["facilities"]["by_category"].values()) == m["facilities"]["count"]


def test_report_has_every_section_and_the_dataset_stamp():
    text = dq.render_markdown(dq.compute_metrics(DS))
    for heading in ("## In one page", "## Terrain", "## Buildings", "## Roads", "## Water bodies", "## Facilities", "## Drains", "## Zones",
                    "## Layer provenance", "## What would improve the data most"):
        assert heading in text, heading
    assert DS["meta"]["generated_at"] in text


def test_committed_report_matches_the_current_dataset():
    """If the dataset is rebuilt, regenerate the report: python gis-engine/data_quality.py"""
    doc = (ROOT / "docs" / "data-quality.md").read_text(encoding="utf-8")
    m = dq.compute_metrics(DS)
    assert DS["meta"]["generated_at"] in doc, "docs/data-quality.md is stale: run python gis-engine/data_quality.py"
    assert f"{m['buildings']['count']} footprints" in doc
