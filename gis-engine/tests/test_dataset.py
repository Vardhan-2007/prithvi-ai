"""Sanity checks on the built pilot dataset (data/processed/pilot_kakinada_01.json).

The dataset is the single input to the whole product, but it is a generated file nobody reads by eye. These tests catch a
broken rebuild (wrong sizes, ids that no longer line up, a stale copy in the frontend) and guard the honesty labels.
"""
import json
import math
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "frontend" / "public" / "data"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


DS = load(PROCESSED / "pilot_kakinada_01.json")
G = DS["grid"]
NX, NY, CELL = G["nx"], G["ny"], G["cell_m"]
W_M, H_M = NX * CELL, NY * CELL


def test_frontend_copy_matches_the_built_dataset():
    assert load(WEB / "pilot_kakinada_01.json") == DS


def test_frontend_copy_of_the_assistant_corpus_matches():
    # same content, formatted differently (one compact, one indented), so compare the parsed JSON
    assert load(WEB / "corpus.json") == load(PROCESSED / "corpus.json")


def test_grid_matches_the_pipeline_constants():
    gis_config = pytest.importorskip("gis_config")
    assert (NX, NY, CELL) == (gis_config.NX, gis_config.NY, gis_config.CELL)


def test_grid_arrays_have_the_declared_size_and_valid_values():
    for key in ("dem", "building_mask", "road_mask"):
        assert len(G[key]) == NX * NY, key
    assert set(G["building_mask"]) <= {0, 1}
    assert set(G["road_mask"]) <= {0, 1}
    assert all(math.isfinite(v) for v in G["dem"])
    assert -5 < min(G["dem"]) < max(G["dem"]) < 50


def test_zones_tile_the_grid_in_order():
    Z = DS["zones"]
    assert len(Z["zones"]) == Z["nx"] * Z["ny"]
    assert Z["nx"] * Z["size_m"] >= W_M and Z["ny"] * Z["size_m"] >= H_M
    for n, z in enumerate(Z["zones"]):
        assert z["id"] == f"zone_{n:03d}"
        assert (z["ix"], z["iy"]) == (n % Z["nx"], n // Z["nx"])
        assert z["cx"] == pytest.approx((z["ix"] + 0.5) * Z["size_m"], abs=0.1)
        assert z["cy"] == pytest.approx((z["iy"] + 0.5) * Z["size_m"], abs=0.1)


def test_zone_indicators_are_normalised_and_complete():
    for z in DS["zones"]["zones"]:
        for k in ("terrain", "imperv", "exposure"):
            assert 0 <= z[k] <= 1, (z["id"], k)
        assert z["n_buildings"] >= 0 and z["road_m"] >= 0
        assert set(z["facilities"]) == {"health", "emergency", "shelter"}
    assert DS["zones"]["wref"] > 0


def test_zone_inlet_weights_point_at_real_inlets():
    n = len(DS["inlets"])
    for z in DS["zones"]["zones"]:
        for k, w in z["inlets"]:
            assert 0 <= k < n and 0 < w <= 1


def test_inlets_are_inside_the_grid_in_the_cell_they_claim():
    ids = [i["id"] for i in DS["inlets"]]
    assert len(ids) == len(set(ids))
    wall = G["building_mask"]
    for i in DS["inlets"]:
        assert 0 <= i["x"] < W_M and 0 <= i["y"] < H_M, i["id"]
        assert (i["ix"], i["iy"]) == (int(i["x"] // CELL), int(i["y"] // CELL)), i["id"]
        assert wall[i["iy"] * NX + i["ix"]] == 0, f"{i['id']} sits inside a building"


def test_every_drain_inlet_is_labelled_proxy():
    # No real drainage inventory exists; the app must never present these as surveyed assets.
    assert {i["status"] for i in DS["inlets"]} == {"proxy"}


def test_facilities_are_valid():
    ids = [f["id"] for f in DS["facilities"]]
    assert len(ids) == len(set(ids))
    for f in DS["facilities"]:
        assert f["category"] in {"health", "emergency", "shelter", "other"}
        assert 0 <= f["x"] < W_M and 0 <= f["y"] < H_M, f["id"]


def test_buildings_and_roads_are_well_formed():
    for b in DS["buildings"]:
        assert len(b["ring"]) >= 3 and b["h"] > 0, b["id"]
    nodes = DS["road_nodes"]
    for r in DS["roads"]:
        assert r["width"] > 0 and len(r["nodes"]) >= 2, r["id"]
        assert all(n in nodes for n in r["nodes"]), r["id"]


def test_every_layer_carries_provenance():
    always = ("id", "title", "source_name", "licence_or_terms", "native_resolution_or_scale",
              "processing_method", "data_status", "known_limitations")
    for layer in DS["layers"]:
        for k in always:
            assert layer.get(k), (layer.get("id"), k)
        assert layer["data_status"] in {"observed", "derived", "proxy", "simulated"}
        # Only layers claiming to be observed must point at a real external source. Proxy, simulated and
        # self-derived layers (team assumption, user rainfall scenario, risk zones) legitimately have none.
        if layer["data_status"] == "observed":
            assert layer.get("source_url") and layer.get("retrieved_at"), layer["id"]
    assert len({layer["id"] for layer in DS["layers"]}) == len(DS["layers"])


def test_dataset_states_that_it_is_not_a_forecast():
    assert "not forecast" in DS["meta"]["statement"].lower()
