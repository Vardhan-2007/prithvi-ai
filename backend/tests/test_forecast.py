"""Live mode: parsing the Open-Meteo ensemble response and picking low / likely / high storms (no network)."""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from services import forecast as fc

NOW = datetime(2026, 11, 23, 9, 30, tzinfo=timezone.utc)


def payload(n_members=10, hours=96, start="2026-11-23T00:00", suffix=""):
    t0 = datetime.fromisoformat(start)
    times = [(t0.replace(tzinfo=None) + __import__("datetime").timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(hours)]
    hourly = {"time": times, f"precipitation{suffix}": [0.5] * hours}           # control run: 0.5 mm every hour
    for m in range(1, n_members):
        hourly[f"precipitation_member{m:02d}{suffix}"] = [float(m) if 12 <= h < 15 else 0.0 for h in range(hours)]
    return {"latitude": 16.95, "longitude": 82.24, "hourly_units": {"precipitation": "mm"}, "hourly": hourly}


def test_parse_reads_control_and_members_in_order():
    times, members = fc.parse_members(payload())
    assert len(times) == 96 and len(members) == 10
    assert members[0][0] == 0.5 and members[3][12] == 3.0


def test_parse_tolerates_a_model_suffix_and_ignores_other_keys():
    p = payload(suffix="_ecmwf_ifs025_ensemble")
    p["hourly"]["temperature_2m"] = [20.0] * 96
    _, members = fc.parse_members(p)
    assert len(members) == 10


def test_window_starts_at_the_current_hour():
    times, members = fc.parse_members(payload())
    start, win = fc.window(times, members, NOW, 24)
    assert start == "2026-11-23T09:00" and len(win[0]) == 24


def test_window_rejects_a_forecast_that_is_too_short():
    times, members = fc.parse_members(payload(hours=20))
    with pytest.raises(fc.ForecastUnavailable):
        fc.window(times, members, NOW, 24)


def test_cases_are_real_members_ordered_by_total():
    out = fc.summarise(payload(n_members=21), NOW, 24)
    c = out["cases"]
    assert c["low"]["total_mm"] <= c["likely"]["total_mm"] <= c["high"]["total_mm"]
    assert len(c["likely"]["hyetograph_mm"]) == 24 and out["members"] == 21
    assert out["status"] == "forecast_driven_scenario" and "Not an official forecast" in out["statement"]
    # every case is one member's actual series
    _, members = fc.parse_members(payload(n_members=21))
    _, win = fc.window(*fc.parse_members(payload(n_members=21)), NOW, 24)
    assert any([round(v, 2) for v in m] == c["high"]["hyetograph_mm"] for m in win)


def test_members_with_gaps_are_dropped():
    p = payload()
    p["hourly"]["precipitation_member02"][10] = None
    _, win = fc.window(*fc.parse_members(p), NOW, 24)
    assert len(win) == 9


def test_live_forecast_caches_for_an_hour_and_wraps_errors():
    fc.clear_cache()
    calls = []
    def fetch(url):
        calls.append(url)
        return payload()
    t = [NOW.timestamp()]
    a = fc.live_forecast(16.95, 82.24, 24, fetch=fetch, clock=lambda: t[0])
    b = fc.live_forecast(16.95, 82.24, 24, fetch=fetch, clock=lambda: t[0] + 600)
    assert len(calls) == 1 and not a["cached"] and b["cached"]
    assert "models=ecmwf_ifs025_ensemble" in calls[0] and "hourly=precipitation" in calls[0]
    fc.clear_cache()
    def boom(url):
        raise OSError("offline")
    with pytest.raises(fc.ForecastUnavailable):
        fc.live_forecast(16.95, 82.24, 24, fetch=boom)
    with pytest.raises(ValueError):
        fc.live_forecast(16.95, 82.24, 30, fetch=fetch)


def test_forecast_route_returns_503_when_offline(monkeypatch):
    from main import app
    fc.clear_cache()
    monkeypatch.setattr(fc, "_fetch_json", lambda url, timeout=15.0: (_ for _ in ()).throw(OSError("offline")))
    c = TestClient(app)
    r = c.get("/api/v1/areas/pilot_kakinada_01/forecast", params={"hours": 24})
    assert r.status_code == 503 and "what-if mode still works" in r.json()["detail"]
    assert c.get("/api/v1/areas/pilot_kakinada_01/forecast", params={"hours": 30}).status_code == 422
    assert c.get("/api/v1/areas/nope/forecast").status_code == 404


def test_forecast_route_with_a_stub(monkeypatch):
    from main import app
    fc.clear_cache()
    monkeypatch.setattr(fc, "_fetch_json", lambda url, timeout=15.0: payload(start=datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00")))
    j = TestClient(app).get("/api/v1/areas/pilot_kakinada_01/forecast").json()
    assert set(j["cases"]) == {"low", "likely", "high"} and j["hours"] == 24 and 16.9 < j["centre"]["lat"] < 17.0
    fc.clear_cache()
