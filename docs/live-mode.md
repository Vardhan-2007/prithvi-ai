# Live mode (forecast-driven scenarios)

Live mode replaces the rain sliders with the real hourly rain forecast for the pilot, so an officer can see what the
next 24, 48 or 72 hours *could* mean. It is a **forecast-driven planning scenario**, not an official forecast or
warning. Official warnings come from IMD, NDMA and the district administration, and the app says so on screen.

## Data

* **Source:** Open-Meteo Ensemble API, model `ecmwf_ifs025_ensemble` (ECMWF IFS 0.25°, 51 members: the control run
  `precipitation` plus `precipitation_member01…50`), variable `hourly=precipitation` (mm in the preceding hour), `timezone=GMT`.
* **Terms:** free for non-commercial use with attribution (CC BY 4.0 data). A commercial deployment needs Open-Meteo's
  commercial plan.
* **Resolution:** about 25 km. The whole 1.6 km pilot sits inside one grid cell, so the forecast is one rain series,
  applied uniformly. The model cannot say it rains more on one street than another.

## From ensemble to three storms

1. Take the next N hours (24 / 48 / 72) from the current GMT hour. Members with any missing hour are dropped.
2. Rank the members by their total rain over the window.
3. **Low / likely / high** = the members at the 10th / 50th / 90th percentile (nearest rank).

Whole members are used, rather than an hour-by-hour percentile, so each case is a storm shape the model actually
produced. The panel also shows the full range across all members.

The chosen case becomes a step hyetograph (1-hour steps) that drives the flood solver exactly like a replayed storm.
The score is provisional while the run is going and final (with simulated water W) when it ends.

## Where the forecast comes from at run time

1. `GET /api/v1/areas/{id}/forecast?hours=…` on the PRITHVI API (cached for 1 h for every visitor), else
2. a direct browser call to Open-Meteo, else
3. the last copy cached in this browser, marked with its age.

If none works, the panel says Live mode is unavailable and the what-if controls keep working. While Live mode is on,
the forecast refreshes every hour. Moving the rain or duration slider switches back to what-if mode.

## Ground and sea

When the forecast loads, Live mode also fills *Ground already wet* (soil moisture now) and *Sea level* (highest tide in the forecast window, Kakinada Bay) from Open-Meteo, and reruns. Replay does the same for the replayed day. If either cannot be loaded, the panel says so; in Replay the missing value is set to 0 rather than kept from another day. See `docs/methodology.md` §2 for the assumed effects.

## Limits

* A model forecast is not an observation. Thunderstorm rain in particular is uncertain in timing and place.
* The flood model underneath is unchanged and uncalibrated (see `limitations.md`).
* Live mode does not send alerts to anyone.

Code: `backend/services/forecast.py`, `frontend/src/scenarios/engine/forecast.ts` (same logic, both tested),
`frontend/src/scenarios/LivePanel.tsx`.
