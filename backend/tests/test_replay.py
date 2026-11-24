"""Storm replay: date rules, parsing and the route, with the network stubbed."""
import json
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services import replay as rp

TODAY = date(2026, 11, 23)


def hourly(key, day, values):
    return {"hourly": {"time": [f"{day}T{h:02d}:00" for h in range(24)], key: values}}


def fake_fetch(url):
    day = url.split("start_date=")[1][:10]
    if "precipitation_previous_day1" in url:
        return hourly("precipitation_previous_day1", day, [0.0] * 10 + [4.0, 12.0, 20.0] + [0.0] * 11)
    return hourly("precipitation", day, [0.0] * 9 + [6.0, 25.0, 31.0, 8.0] + [0.0] * 11)


def test_date_rules():
    assert rp.check_date(date(2026, 9, 1), TODAY) == {"forecast_day_ahead": True, "actual": True}
    assert rp.check_date(date(2023, 12, 5), TODAY)["forecast_day_ahead"] is False      # archive starts 2024
    assert rp.check_date(date(2026, 11, 21), TODAY)["actual"] is False                   # archive ~5 days behind
    with pytest.raises(ValueError):
        rp.check_date(TODAY, TODAY)


def test_both_series_and_totals():
    rp.clear_cache()
    out = rp.replay_rain(16.95, 82.24, date(2026, 9, 1), TODAY, fetch=fake_fetch)
    assert out["totals_mm"] == {"forecast_day_ahead": 36.0, "actual": 70.0}
    assert len(out["series"]["actual"]) == 24 and out["timezone"] == "Asia/Kolkata"
    assert "not rain-gauge records" in out["statement"]
    assert rp.replay_rain(16.95, 82.24, date(2026, 9, 1), TODAY, fetch=lambda u: 1 / 0)["cached"]


def test_old_date_gives_actual_only_with_a_note():
    rp.clear_cache()
    out = rp.replay_rain(16.95, 82.24, date(2023, 12, 5), TODAY, fetch=fake_fetch)
    assert list(out["series"]) == ["actual"] and any("2024-01-01" in n for n in out["notes"])


def test_gaps_and_outages_are_reported_not_hidden():
    rp.clear_cache()
    def gappy(url):
        j = fake_fetch(url)
        if "previous_day1" in url:
            j["hourly"]["precipitation_previous_day1"][5] = None
        return j
    out = rp.replay_rain(16.95, 82.24, date(2026, 9, 2), TODAY, fetch=gappy)
    assert list(out["series"]) == ["actual"] and any("gaps" in n for n in out["notes"])
    rp.clear_cache()
    with pytest.raises(rp.ReplayUnavailable):
        rp.replay_rain(16.95, 82.24, date(2026, 9, 3), TODAY, fetch=lambda u: (_ for _ in ()).throw(OSError("offline")))


def test_route_validation(monkeypatch):
    from main import app
    c = TestClient(app)
    assert c.get("/api/v1/areas/pilot_kakinada_01/replay", params={"date": "2099-01-01"}).status_code == 422
    assert c.get("/api/v1/areas/pilot_kakinada_01/replay", params={"date": "01-09-2026"}).status_code == 422
    assert c.get("/api/v1/areas/pilot_kakinada_01/replay", params={"date": "2026-02-30"}).status_code == 422
    rp.clear_cache()
    monkeypatch.setattr(rp, "_fetch_json", lambda url, timeout=20.0: fake_fetch(url))
    j = c.get("/api/v1/areas/pilot_kakinada_01/replay", params={"date": "2026-09-01"}).json()
    assert j["totals_mm"]["actual"] == 70.0
    rp.clear_cache()


def test_observed_template_is_valid_empty_and_in_sync():
    root = Path(__file__).resolve().parents[2]
    a = json.loads((root / "data" / "validation" / "observed_waterlogging.json").read_text(encoding="utf-8"))
    b = json.loads((root / "frontend" / "public" / "data" / "observed_waterlogging.json").read_text(encoding="utf-8"))
    assert a == b, "run: make validation"
    assert isinstance(a["reports"], list)
    for r in a["reports"]:
        for k in ("event_date", "place_name", "lat", "lon", "source_url", "source_type"):
            assert k in r, (k, r)
        assert r["source_type"] in ("news", "official", "team_visit")
        assert r["source_url"].startswith("https://")
        assert date.fromisoformat(r["event_date"]) <= date.fromisoformat(r.get("event_end_date", r["event_date"]))
    # every street a report points at must exist in the pilot dataset
    ds = json.loads((root / "data" / "processed" / "pilot_kakinada_01.json").read_text(encoding="utf-8"))
    ways = {w["id"] for w in ds["roads"]}
    for r in a["reports"]:
        assert set(r.get("osm_way_ids", [])) <= ways, r["place_name"]
