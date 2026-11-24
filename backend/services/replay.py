"""Storm replay: the hourly rain for one past local day at the pilot, two ways.

* forecast_day_ahead - what the forecast said 24 h before each hour (Open-Meteo Previous Runs API,
  variable `precipitation_previous_day1`; archived from January 2024).
* actual - the rain that fell, from Open-Meteo's historical weather archive (`archive-api`, best-match
  ECMWF IFS / ERA5 reanalysis; available about 5 days after the date). Model-based, NOT a rain gauge.

Running the flood solver on both and comparing with observed waterlogging reports
(data/validation/observed_waterlogging.json) is the project's honest validation check. Mirrors
frontend/src/scenarios/engine/replay.ts."""
from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from datetime import date, timedelta
from typing import Any

PREVIOUS_RUNS_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_VAR = "precipitation_previous_day1"
TZ = "Asia/Kolkata"
FORECAST_ARCHIVE_START = date(2024, 1, 1)
ARCHIVE_DELAY_DAYS = 5

_CACHE: dict[tuple, dict[str, Any]] = {}


class ReplayUnavailable(RuntimeError):
    pass


def check_date(d: date, today: date) -> dict[str, Any]:
    """Which series can exist for this date. Raises ValueError for dates that make no sense."""
    if d >= today:
        raise ValueError("replay needs a past date")
    return {"forecast_day_ahead": d >= FORECAST_ARCHIVE_START,
            "actual": d <= today - timedelta(days=ARCHIVE_DELAY_DAYS)}


def _series(payload: dict[str, Any], key: str, day: str) -> list[float]:
    hourly = payload.get("hourly") or {}
    times, vals = hourly.get("time"), hourly.get(key)
    if not isinstance(times, list) or not isinstance(vals, list) or len(times) != len(vals):
        raise ReplayUnavailable(f"response has no hourly '{key}'")
    out = [v for t, v in zip(times, vals) if isinstance(t, str) and t.startswith(day)]
    if len(out) != 24:
        raise ReplayUnavailable(f"expected 24 hours for {day}, got {len(out)}")
    if any(v is None or not math.isfinite(float(v)) for v in out):
        raise ReplayUnavailable(f"'{key}' has gaps on {day}")
    return [round(max(0.0, float(v)), 2) for v in out]


def _url(base: str, lat: float, lon: float, day: str, var: str, extra: dict | None = None) -> str:
    q = {"latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}", "hourly": var, "start_date": day, "end_date": day, "timezone": TZ,
         **(extra or {})}
    return f"{base}?{urllib.parse.urlencode(q)}"


def _fetch_json(url: str, timeout: float = 20.0) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "prithvi-ai/0.1 (hackathon prototype)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 - fixed https hosts
        return json.loads(r.read().decode("utf-8"))


def replay_rain(lat: float, lon: float, d: date, today: date, fetch=None) -> dict[str, Any]:
    fetch = fetch or _fetch_json
    avail = check_date(d, today)
    day = d.isoformat()
    key = (round(lat, 3), round(lon, 3), day)
    if key in _CACHE:
        return {**_CACHE[key], "cached": True}
    out: dict[str, Any] = {
        "date": day, "timezone": TZ, "step_hours": 1,
        "statement": "Replay of a past day for honest checking against what was reported. Rain series are model-based, not rain-gauge records.",
        "series": {}, "notes": [],
        "sources": {
            "forecast_day_ahead": {"name": "Open-Meteo Previous Runs API: best-match forecast issued 24 h before each hour",
                                   "url": "https://open-meteo.com/en/docs/previous-runs-api", "variable": FORECAST_VAR},
            "actual": {"name": "Open-Meteo historical weather archive (best match: ECMWF IFS / ERA5 reanalysis)",
                       "url": "https://open-meteo.com/en/docs/historical-weather-api", "variable": "precipitation"},
        },
    }
    if avail["forecast_day_ahead"]:
        try:
            out["series"]["forecast_day_ahead"] = _series(fetch(_url(PREVIOUS_RUNS_URL, lat, lon, day, FORECAST_VAR)), FORECAST_VAR, day)
        except ReplayUnavailable as exc:
            out["notes"].append(f"day-ahead forecast: {exc}")
        except Exception as exc:  # network / HTTP
            out["notes"].append(f"day-ahead forecast: could not reach the service ({type(exc).__name__})")
    else:
        out["notes"].append(f"day-ahead forecasts are archived from {FORECAST_ARCHIVE_START.isoformat()} only")
    if avail["actual"]:
        try:
            out["series"]["actual"] = _series(fetch(_url(ARCHIVE_URL, lat, lon, day, "precipitation")), "precipitation", day)
        except ReplayUnavailable as exc:
            out["notes"].append(f"actual rain: {exc}")
        except Exception as exc:
            out["notes"].append(f"actual rain: could not reach the service ({type(exc).__name__})")
    else:
        out["notes"].append(f"the rain archive is about {ARCHIVE_DELAY_DAYS} days behind; try an earlier date")
    if not out["series"]:
        raise ReplayUnavailable("; ".join(out["notes"]) or "no rain series available")
    out["totals_mm"] = {k: round(sum(v), 1) for k, v in out["series"].items()}
    if len(out["series"]) == 2:          # cache only complete answers
        _CACHE[key] = out
    return {**out, "cached": False}


def clear_cache() -> None:
    _CACHE.clear()
