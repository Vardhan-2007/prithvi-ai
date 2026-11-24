"""Tests for gis-engine/validation_diagnosis.py (terrain-versus-reports diagnosis)."""
import json
from pathlib import Path

import numpy as np
import pytest

import validation_diagnosis as vd

ROOT = Path(__file__).resolve().parents[2]
OX, OY, ML, MT = 82.0, 17.0, 100000.0, 110000.0


def lonlat(x, y):
    return OX + x / ML, OY + y / MT


def report(name, x, y, date="2026-11-02", ways=None):
    lon, lat = lonlat(x, y)
    r = {"event_date": date, "place_name": name, "lat": lat, "lon": lon}
    if ways:
        r["osm_way_ids"] = ways
    return r


DS = {"meta": {"origin": {"lon": OX, "lat": OY}, "m_per_deg": {"lon": ML, "lat": MT}, "size_m": [1000.0, 1000.0]},
      "roads": [{"id": "w1", "pts": [[100, 100], [200, 100], [300, 100]]}, {"id": "w2", "pts": [[100, 500], [100, 600]]}]}


def zone(zid, cx, cy):
    return {"id": zid, "cx": cx, "cy": cy}


def test_percentile_below_counts_strictly_lower_values():
    v = np.array([1.0, 2.0, 3.0, 4.0])
    assert vd.percentile_below(v, 0.5) == 0.0       # lower than everything: lowest ground
    assert vd.percentile_below(v, 3.0) == 50.0
    assert vd.percentile_below(v, 9.0) == 100.0


def test_places_keep_only_reports_inside_the_pilot_and_merge_the_cinema_pin():
    obs = {"reports": [
        report("Main Road, Kakinada", 150, 100, ways=["w1"]),
        report("Main Road, Kakinada", 150, 100, date="2026-06-28", ways=["w1"]),
        report("Cinema Street, Kakinada", 500, 500),
        report("Cinema Road, Kakinada", 500, 500, date="2026-06-28"),
        report("Far Away, Kakinada", 5000, 5000),             # outside the 1 km box
        report("Behind The Origin, Kakinada", -50, 100),
    ]}
    places = vd.places_in_pilot(DS, obs)
    assert sorted(places) == ["Cinema Street/Road", "Main Road"]
    assert places["Main Road"]["n"] == 2 and places["Cinema Street/Road"]["n"] == 2
    assert places["Main Road"]["dates"] == ["2026-11-02", "2026-06-28"]


def test_a_street_report_contributes_every_vertex_of_the_street_and_a_point_report_its_pin():
    obs = {"reports": [report("Main Road, Kakinada", 150, 100, ways=["w1", "w2"]), report("Dairy, Kakinada", 400, 400)]}
    places = vd.places_in_pilot(DS, obs)
    assert places["Main Road"]["pts"] == [(100, 100), (200, 100), (300, 100), (100, 500), (100, 600)]
    assert places["Main Road"]["pins"] == [pytest.approx((150, 100), abs=0.1)]
    assert places["Dairy"]["pts"] == [pytest.approx((400, 400), abs=0.1)]


def test_unknown_way_ids_fall_back_to_the_reported_point():
    places = vd.places_in_pilot(DS, {"reports": [report("Ghost Road, Kakinada", 250, 250, ways=["w404"])]})
    assert places["Ghost Road"]["pts"] == [pytest.approx((250, 250), abs=0.1)]


def test_nearest_distance_and_hits_use_the_150_m_rule():
    zs = [zone("a", 0, 0), zone("b", 1000, 0)]
    near = {"pts": [(100, 0)]}                   # 100 m from zone a
    far = {"pts": [(500, 0)]}                    # 500 m from both
    edge = {"pts": [(1150, 0)]}                  # exactly 150 m from zone b
    assert vd.nearest_m(zs, near["pts"]) == pytest.approx(100)
    assert vd.hits(zs, {"near": near, "far": far, "edge": edge}) == 2


def test_blind_guess_is_repeatable_and_exact_at_the_extremes():
    zs = [zone(str(i), 200.0 * i, 0.0) for i in range(10)]
    places = {"p": {"pts": [(0, 0)]}, "q": {"pts": [(1800, 0)]}}
    assert vd.blind_guess(zs, places, 3) == vd.blind_guess(zs, places, 3)
    mean_all, zero_all = vd.blind_guess(zs, places, len(zs))
    assert mean_all == 2.0 and zero_all == 0.0       # flagging every zone reaches every place
    mean_one, zero_one = vd.blind_guess(zs, places, 1)
    assert 0.0 < mean_one < 2.0 and 0.0 < zero_one < 1.0


# ---------------------------------------------------------------- the real dataset
REAL = json.loads((ROOT / "data" / "processed" / "pilot_kakinada_01.json").read_text(encoding="utf-8"))
OBS = json.loads((ROOT / "data" / "validation" / "observed_waterlogging.json").read_text(encoding="utf-8"))


def test_real_reports_give_the_places_the_docs_describe():
    places = vd.places_in_pilot(REAL, OBS)
    assert {"Main Road", "Temple Street", "Cinema Street/Road", "Sambamurthy Nagar"} <= set(places)
    m = REAL["meta"]
    w, h = m["size_m"]
    inside = sum(1 for r in OBS["reports"]
                 if 0 <= (r["lon"] - m["origin"]["lon"]) * m["m_per_deg"]["lon"] < w and 0 <= (r["lat"] - m["origin"]["lat"]) * m["m_per_deg"]["lat"] < h)
    assert sum(p["n"] for p in places.values()) == inside     # every in-pilot report is counted exactly once


def test_table_a_has_a_row_per_place_and_percentages_in_range():
    places = vd.places_in_pilot(REAL, OBS)
    rows = vd.table_a(REAL, places)
    assert len(rows) == len(places) + 1
    for name, p in places.items():
        zs = REAL["zones"]["zones"]
        raw = np.array([z["mean_elev"] for z in zs])
        for x, y in p["pins"]:
            zid = min(REAL["zones"]["ny"] - 1, int(y // REAL["zones"]["size_m"])) * REAL["zones"]["nx"] + min(REAL["zones"]["nx"] - 1, int(x // REAL["zones"]["size_m"]))
            assert 0 <= vd.percentile_below(raw, zs[zid]["mean_elev"]) <= 100


def test_flagging_more_of_the_lowest_ground_never_reduces_hits():
    places = vd.places_in_pilot(REAL, OBS)
    rows = vd.table_c(REAL, places)
    counts = [int(r.split(":")[1].split()[0]) for r in rows]
    assert counts == sorted(counts) and len(rows) == len(vd.LOWEST_SHARES)


def test_committed_diagnosis_matches_the_current_dataset_build():
    """If the dataset or the reports change, rerun python gis-engine/validation_diagnosis.py and update the doc."""
    doc = (ROOT / "docs" / "validation-diagnosis.md").read_text(encoding="utf-8")
    assert REAL["meta"]["generated_at"] in doc, "docs/validation-diagnosis.md is stale: rerun gis-engine/validation_diagnosis.py"
    assert f"{len(OBS['reports'])} reports" in doc
