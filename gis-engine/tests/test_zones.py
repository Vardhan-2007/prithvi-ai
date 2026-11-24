"""Unit tests for risk_analysis.zones.build_zones on small synthetic inputs (no network, no real data)."""
import numpy as np
import pytest

from gis_config import CELL, NX, NY, ZONE_CELLS
from risk_analysis.zones import build_zones, minmax

ZSIZE = ZONE_CELLS * CELL


def flat_inputs(dem=None):
    dem = np.full((NY, NX), 5.0) if dem is None else dem
    return dict(dem=dem, bmask=np.zeros((NY, NX), dtype=int), rmask=np.zeros((NY, NX), dtype=int),
                buildings=[], roads=[], facilities=[], inlets=[])


def zones(**over):
    args = flat_inputs()
    args.update(over)
    out = build_zones(**args)
    return out, {z["id"]: z for z in out["zones"]}


def ring(x, y, s=10.0):
    return [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]


def test_minmax_rescales_and_handles_constant_input():
    assert minmax(np.array([2.0, 4.0, 6.0])).tolist() == [0.0, 0.5, 1.0]
    assert minmax(np.array([3.0, 3.0])).tolist() == [0.0, 0.0]


def test_zone_grid_covers_the_pilot_area():
    out, _ = zones()
    assert out["nx"] * ZONE_CELLS >= NX and out["ny"] * ZONE_CELLS >= NY
    assert len(out["zones"]) == out["nx"] * out["ny"]
    assert out["size_m"] == ZSIZE
    assert out["zones"][0]["id"] == "zone_000" and out["zones"][-1]["id"] == f"zone_{len(out['zones']) - 1:03d}"


def test_empty_area_has_no_exposure_or_imperviousness():
    _, by_id = zones()
    for z in by_id.values():
        assert z["imperv"] == 0 and z["exposure"] == 0 and z["n_buildings"] == 0 and z["road_m"] == 0
        assert z["terrain"] == 0          # a perfectly flat area has no relative terrain susceptibility
        assert z["inlets"] == []


def test_lower_ground_scores_higher_terrain_susceptibility():
    dem = np.tile(np.linspace(10.0, 2.0, NX), (NY, 1))     # falls from west (high) to east (low)
    out, by_id = zones(dem=dem)
    west, east = by_id["zone_000"], by_id[f"zone_{out['nx'] - 1:03d}"]
    assert east["mean_elev"] < west["mean_elev"]
    assert east["terrain"] > west["terrain"]
    assert all(0 <= z["terrain"] <= 1 for z in by_id.values())


def test_a_depression_scores_higher_than_the_same_height_on_a_slope():
    dem = np.full((NY, NX), 6.0)
    dem[3 * ZONE_CELLS:4 * ZONE_CELLS, 3 * ZONE_CELLS:4 * ZONE_CELLS] = 3.0   # one zone sunk below its neighbours
    out, by_id = zones(dem=dem)
    pit = by_id[f"zone_{3 * out['nx'] + 3:03d}"]
    assert pit["terrain"] == max(z["terrain"] for z in by_id.values())


def test_imperviousness_is_the_covered_fraction_of_the_zone():
    bmask = np.zeros((NY, NX), dtype=int)
    bmask[0:ZONE_CELLS // 2, 0:ZONE_CELLS] = 1                 # top half of zone_000 is built over
    _, by_id = zones(bmask=bmask)
    assert by_id["zone_000"]["imperv"] == pytest.approx(0.5)
    assert by_id["zone_001"]["imperv"] == 0


def test_buildings_roads_and_facilities_land_in_the_right_zone():
    out, by_id = zones(
        buildings=[{"ring": ring(ZSIZE + 10, 10)}, {"ring": ring(ZSIZE + 40, 40)}],
        roads=[{"pts": [[10, 10], [60, 10]]}],                  # 50 m inside zone_000
        facilities=[{"x": ZSIZE + 5, "y": 5, "category": "health"}, {"x": 5, "y": 5, "category": "other"}],
    )
    assert by_id["zone_001"]["n_buildings"] == 2 and by_id["zone_000"]["n_buildings"] == 0
    assert by_id["zone_000"]["road_m"] == pytest.approx(50, abs=1)
    assert by_id["zone_001"]["facilities"] == {"health": 1, "emergency": 0, "shelter": 0}
    assert by_id["zone_000"]["facilities"] == {"health": 0, "emergency": 0, "shelter": 0}   # "other" is not counted
    assert by_id["zone_001"]["exposure"] > by_id["zone_000"]["exposure"] >= 0


def test_a_critical_facility_raises_exposure_but_never_above_one():
    _, plain = zones(buildings=[{"ring": ring(10, 10)}])
    _, with_h = zones(buildings=[{"ring": ring(10, 10)}], facilities=[{"x": 20, "y": 20, "category": "health"}])
    assert with_h["zone_000"]["exposure"] >= plain["zone_000"]["exposure"]
    many = [{"x": 20 + i, "y": 20, "category": "health"} for i in range(10)]
    _, loaded = zones(facilities=many)
    assert all(0 <= z["exposure"] <= 1 for z in loaded.values())


def test_things_outside_the_grid_are_ignored():
    _, by_id = zones(buildings=[{"ring": ring(-500, -500)}], facilities=[{"x": -5, "y": -5, "category": "health"}],
                     roads=[{"pts": [[-100, -100], [-50, -100]]}])
    assert sum(z["n_buildings"] for z in by_id.values()) == 0
    assert sum(sum(z["facilities"].values()) for z in by_id.values()) == 0
    assert sum(z["road_m"] for z in by_id.values()) == 0


def test_inlet_weights_fall_off_with_distance_and_stop_at_250_m():
    centre = (0.5 * ZSIZE, 0.5 * ZSIZE)                          # centre of zone_000
    inlets = [{"x": centre[0], "y": centre[1]}, {"x": centre[0] + 100, "y": centre[1]}, {"x": centre[0] + 400, "y": centre[1]}]
    out, by_id = zones(inlets=inlets)
    w = dict(map(tuple, by_id["zone_000"]["inlets"]))
    assert w[0] == pytest.approx(1.0)
    assert 0 < w[1] < w[0]
    assert 2 not in w                                            # 400 m away: out of reach
    assert out["wref"] > 0
