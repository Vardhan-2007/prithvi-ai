"""Live mode: hour-by-hour rain forecast for the pilot from the Open-Meteo Ensemble API, reduced to three storms
(low / likely / high) for the flood solver.

Source: https://open-meteo.com/en/docs/ensemble-api (free, no key, non-commercial use, attribution required).
Model: ECMWF IFS 0.25 deg ensemble (~25 km grid, 51 members). The whole pilot area (1.6 km) sits inside one grid cell,
so the forecast is a single rain series applied uniformly. This is a FORECAST-DRIVEN SCENARIO, not an official
forecast or warning: official warnings come from IMD and the district administration.

Mirrors frontend/src/scenarios/engine/forecast.ts (parsing and case selection)."""
from __future__ import annotations

import json
import math
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble"
MODEL = "ecmwf_ifs025_ensemble"
MODEL_LABEL = "ECMWF IFS 0.25° ensemble via Open-Meteo"
ALLOWED_HOURS = (24, 48, 72)
CACHE_TTL_S = 3600
CASE_PERCENTILES = {"low": 0.10, "likely": 0.50, "high": 0.90}
_MEMBER_KEY = re.compile(r"^precipitation(?:_member(\d+))?(?:_[a-z0-9_]+)?$")

_CACHE: dict[tuple, tuple[float, dict[str, Any]]] = {}


class ForecastUnavailable(RuntimeError):
    pass


def parse_members(payload: dict[str, Any]) -> tuple[list[str], list[list[float]]]:
    """(times, members) from an Open-Meteo ensemble JSON. Each member is an hourly precipitation series (mm).
    The control run is `precipitation`, perturbed members `precipitation_member01` ...; a model suffix is tolerated."""
    hourly = payload.get("hourly") or {}
    times = hourly.get("time")
    if not isinstance(times, list) or not times:
        raise ForecastUnavailable("forecast response has no hourly time axis")
    members: list[tuple[int, list[float]]] = []
    for key, series in hourly.items():
        m = _MEMBER_KEY.match(key)
        if not m or not isinstance(series, list) or len(series) != len(times):
            continue
        clean = [max(0.0, float(v)) if v is not None and math.isfinite(float(v)) else math.nan for v in series]
        members.append((int(m.group(1) or 0), clean))
    if not members:
        raise ForecastUnavailable("forecast response has no precipitation members")
    members.sort(key=lambda p: p[0])
    return times, [s for _, s in members]


def window(times: list[str], members: list[list[float]], now: datetime, hours: int) -> tuple[str, list[list[float]]]:
    """Slice `hours` hourly steps starting at the current hour (times are GMT, 'YYYY-MM-DDTHH:MM').
    Members with missing values in the window are dropped."""
    stamp = now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:00")
    start = next((i for i, t in enumerate(times) if t >= stamp), None)
    if start is None or start + hours > len(times):
        raise ForecastUnavailable(f"forecast does not cover the next {hours} h")
    out = [m[start:start + hours] for m in members]
    out = [m for m in out if not any(math.isnan(v) for v in m)]
    if not out:
        raise ForecastUnavailable("every ensemble member has gaps in the forecast window")
    return times[start], out


def pick_cases(members: list[list[float]]) -> dict[str, dict[str, Any]]:
    """Low / likely / high = the real ensemble members at the 10th / 50th / 90th percentile of total rain
    (nearest rank). Using whole members keeps physically consistent storm shapes; hour-by-hour percentiles would not."""
    order = sorted(range(len(members)), key=lambda i: (sum(members[i]), i))
    n = len(order)
    cases = {}
    for name, q in CASE_PERCENTILES.items():
        k = min(n - 1, max(0, math.ceil(q * n) - 1))
        m = members[order[k]]
        cases[name] = {"hyetograph_mm": [round(v, 2) for v in m], "total_mm": round(sum(m), 1),
                       "peak_mm_h": round(max(m), 1), "member_rank": k + 1}
    return cases


def summarise(payload: dict[str, Any], now: datetime, hours: int) -> dict[str, Any]:
    times, members = parse_members(payload)
    start, win = window(times, members, now, hours)
    totals = sorted(sum(m) for m in win)
    return {
        "status": "forecast_driven_scenario",
        "statement": "Forecast-driven scenario for planning. Not an official forecast or warning: follow IMD and the district administration.",
        "source": {"name": MODEL_LABEL, "url": "https://open-meteo.com/en/docs/ensemble-api", "model": MODEL,
                   "licence": "Open-Meteo free API: non-commercial use, attribution required (CC BY 4.0 data)",
                   "grid": "~25 km; the whole pilot area is inside one grid cell, so rain is uniform across it"},
        "start_utc": start, "step_hours": 1, "hours": hours, "members": len(win),
        "range_mm": {"min": round(totals[0], 1), "max": round(totals[-1], 1)},
        "cases": pick_cases(win),
        "fetched_at_utc": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def _fetch_json(url: str, timeout: float = 15.0) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "prithvi-ai/0.1 (hackathon prototype)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 - fixed https host
        return json.loads(r.read().decode("utf-8"))


def ensemble_url(lat: float, lon: float, hours: int) -> str:
    days = min(16, math.ceil(hours / 24) + 1)
    q = {"latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}", "hourly": "precipitation", "models": MODEL,
         "forecast_days": days, "timezone": "GMT"}
    return f"{ENSEMBLE_URL}?{urllib.parse.urlencode(q)}"


def live_forecast(lat: float, lon: float, hours: int, fetch=None, clock=time.time) -> dict[str, Any]:
    """Cached (1 h) forecast summary for the pilot centre. Raises ForecastUnavailable on any failure."""
    if hours not in ALLOWED_HOURS:
        raise ValueError(f"hours must be one of {ALLOWED_HOURS}")
    key = (round(lat, 3), round(lon, 3), hours)
    hit = _CACHE.get(key)
    now_s = clock()
    if hit and now_s - hit[0] < CACHE_TTL_S:
        return {**hit[1], "cached": True}
    fetch = fetch or _fetch_json   # looked up at call time so tests can stub the network
    try:
        payload = fetch(ensemble_url(lat, lon, hours))
    except ForecastUnavailable:
        raise
    except Exception as exc:  # network, HTTP, JSON
        raise ForecastUnavailable(f"could not reach the forecast service ({type(exc).__name__})") from exc
    out = summarise(payload, datetime.fromtimestamp(now_s, tz=timezone.utc), hours)
    _CACHE[key] = (now_s, out)
    return {**out, "cached": False}


def clear_cache() -> None:
    _CACHE.clear()
