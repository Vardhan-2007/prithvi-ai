"""upgrade_pilot.py without the network: candidate building, channel burning, the replay check and its scoring."""
import json
from pathlib import Path

import numpy as np
import pytest

from processing import upgrade_pilot as up

ROOT = Path(__file__).resolve().parents[2]
DS = json.loads((ROOT / "data" / "processed" / "pilot_kakinada_01.json").read_text())
REPORTS = json.loads((ROOT / "data" / "validation" / "observed_waterlogging.json").read_text())["reports"]


def samples_from_dataset(n=21):
    """A lattice resampled from the dataset's own DEM, in the format of the GLO-90 / GLO-30 sample caches."""
    g = DS["grid"]; dem = np.array(g["dem"]).reshape(g["ny"], g["nx"])
    ys = np.linspace(0, g["ny"] - 1, n).round().astype(int); xs = np.linspace(0, g["nx"] - 1, n).round().astype(int)
    return {"n": n, "elevation_m": [float(dem[y, x]) for y in ys for x in xs], "retrieved_at": "test"}


RAW_DRAINS = {"elements": [
    {"type": "way", "id": 1, "tags": {"waterway": "drain", "name": "Test drain"}, "geometry": [{"lat": 16.946, "lon": 82.234}, {"lat": 16.946, "lon": 82.244}]},
    {"type": "way", "id": 2, "tags": {"waterway": "drain", "tunnel": "culvert"}, "geometry": [{"lat": 16.950, "lon": 82.235}, {"lat": 16.951, "lon": 82.236}]},
    {"type": "way", "id": 3, "tags": {"waterway": "river"}, "geometry": [{"lat": 17.5, "lon": 83.0}, {"lat": 17.6, "lon": 83.1}]},
    {"type": "way", "id": 4, "tags": {"waterway": "weir"}, "geometry": [{"lat": 16.95, "lon": 82.24}, {"lat": 16.951, "lon": 82.241}]},
]}


def test_parse_drains_keeps_channels_near_the_pilot():
    d = up.parse_drains(RAW_DRAINS)
    assert [x["id"] for x in d] == ["w1", "w2"]
    assert d[0]["name"] == "Test drain" and not d[0]["covered"] and d[1]["covered"]


def test_open_channels_are_cut_into_the_terrain_and_culverts_are_not():
    d = up.parse_drains(RAW_DRAINS)
    cut = up.channel_grid(d)
    assert cut.max() == pytest.approx(0.5) and (cut > 0).sum() > 40
    only_culvert = up.channel_grid([d[1]])
    assert only_culvert.sum() == 0


def test_candidate_keeps_osm_layers_and_stays_valid():
    ds1, info = up.build_candidate(DS, samples_from_dataset(), 2, up.parse_drains(RAW_DRAINS), "glo90", "2026-11-24")
    for k in ("buildings", "roads", "facilities", "road_nodes"):
        assert ds1[k] == DS[k]
    assert [i["id"] for i in ds1["inlets"]] == [i["id"] for i in DS["inlets"]]
    assert len(ds1["grid"]["dem"]) == len(DS["grid"]["dem"]) and all(np.isfinite(ds1["grid"]["dem"]))
    assert len(ds1["zones"]["zones"]) == len(DS["zones"]["zones"])
    assert {L["id"] for L in ds1["layers"]} == {L["id"] for L in DS["layers"]} | {"mapped_drains"}
    assert ds1["drains"][0]["id"] == "w1" and info["channel_cells"] > 0
    assert "drains" not in DS                                    # the input is not modified


def test_scoring_matches_the_replay_tab_rules():
    all_flagged = [{"band": "highest"}] * len(DS["zones"]["zones"])
    none = [{"band": "lower"}] * len(DS["zones"]["zones"])
    day = "2026-11-03"
    a = up.score_reports(DS, all_flagged, REPORTS, day)
    b = up.score_reports(DS, none, REPORTS, day)
    assert a["n"] == b["n"] == 4 and a["outside"] == 9
    assert a["hits"] == 4 and b["hits"] == 0
    assert up.report_days(DS, REPORTS) == ["2026-06-28", "2026-11-02", "2026-11-03"]


def test_replay_day_runs_the_solver_and_scores():
    r = up.replay_day(DS, [0.0, 20.0, 5.0], REPORTS, "2026-06-28")
    assert r["rain_mm"] == 25.0 and r["n"] == 3 and 0 <= r["hits"] <= 3


def test_command_line_end_to_end_with_stubbed_downloads(tmp_path, monkeypatch, capsys):
    import services.replay as rp
    proc, web, val = tmp_path / "processed", tmp_path / "web", tmp_path / "validation"
    for d in (proc, web, val):
        d.mkdir()
    (proc / "pilot_kakinada_01.json").write_text(json.dumps(DS))
    (val / "observed_waterlogging.json").write_text(json.dumps({"reports": REPORTS}))
    monkeypatch.setattr(up, "PROCESSED", proc); monkeypatch.setattr(up, "WEB_PUBLIC", web); monkeypatch.setattr(up, "VALIDATION", val)
    monkeypatch.setattr(up, "fetch_glo30_samples", lambda refresh: {**samples_from_dataset(56), "retrieved_at": "test"})
    monkeypatch.setattr(up, "fetch_osm_drains", lambda refresh: (up.parse_drains(RAW_DRAINS), "test"))
    monkeypatch.setattr(rp, "replay_rain", lambda lat, lon, d, today: {"series": {"actual": [0.0, 8.0, 2.0]}})
    # the solver run itself is covered by test_replay_day_runs_the_solver_and_scores; keep this test fast
    monkeypatch.setattr(up, "replay_day", lambda ds, rain, reports, day: {"hits": 0, "n": 1, "flagged": 0, "rain_mm": sum(rain), "has_drains": "drains" in ds})
    assert up.main(["--dem", "glo30", "--drains"]) == 0
    assert not (web / "pilot_kakinada_01.json").exists()          # nothing written without --apply
    check = json.loads((val / "upgrade_check.json").read_text())
    assert [d["date"] for d in check["days"]] == ["2026-06-28", "2026-11-02", "2026-11-03"]
    assert all(d["candidate"]["has_drains"] and not d["current"]["has_drains"] for d in check["days"])
    assert up.main(["--dem", "glo30", "--drains", "--apply", "--no-replay"]) == 0
    new = json.loads((web / "pilot_kakinada_01.json").read_text())
    assert new == json.loads((proc / "pilot_kakinada_01.json").read_text()) and len(new["drains"]) == 2
    assert next(L for L in new["layers"] if L["id"] == "dem")["source_name"].startswith("Copernicus GLO-30")
    assert (proc / "layers.yaml").read_text().count("- id:") == len(new["layers"])
