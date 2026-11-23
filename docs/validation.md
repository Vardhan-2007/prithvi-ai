# Validation: checking PRITHVI against what really happened

Until now the project only tested **internal consistency** (mass conservation, determinism, the two engines agreeing).
The Replay tab adds the first check against the real world. This page sets out how to do that honestly.

## The protocol (follow it in this order)

1. **Choose the event first.** Pick a past day when Kakinada had heavy rain and reported waterlogging, *before* running
   the model on it. Write down why you picked it.
2. **Collect the reports before looking at the model.** Add every report you find for that day to
   `data/validation/observed_waterlogging.json` (schema below), then run `make validation` to copy it into the web app.
   Include reports from *outside* the pilot area too; the app counts and excludes them instead of you deciding.
3. **Run the replay.** In the Replay tab, load the date and run **both** series:
   * *Forecast issued the day before*: what PRITHVI would have shown on the eve of the storm.
   * *Rain that fell*: what the model makes of the storm itself.
4. **Report the result whatever it shows.** Write the numbers into the table at the end of this page, including misses.
   Do not tune weights, thresholds or the hit radius after seeing the result. If you change a rule, re-run every event
   and say so.

## The scoring rule

* A report is a **hit** if a zone flagged *Higher* or *Highest* by the **final** score (with simulated water) has its
  centre within **150 m** (`HIT_RADIUS_M` in `frontend/src/scenarios/engine/replay.ts`) of the reported spot. Otherwise
  it is a **miss**.
* Reports outside the pilot boundary are listed as *outside* and not scored.
* Flagged zones with no report nearby are counted, but **not** called false alarms: in news-based data, a missing report
  does not mean there was no flooding.

## Data the Replay tab uses

| Series | Source | Available | Status |
|---|---|---|---|
| Forecast issued the day before | Open-Meteo Previous Runs API, `precipitation_previous_day1` (value predicted 24 h before each hour), best-match models | from 2024-01-01 | model forecast |
| Rain that fell | Open-Meteo historical weather archive (best match: ECMWF IFS / ERA5 reanalysis) | from 1940, about 5 days behind today | model reanalysis, **not a rain gauge** |

Both are model products on grids of 9–25 km, so both are uniform over the pilot. A rain-gauge record from IMD or the
AP State Development Planning Society would be better evidence and is the next upgrade.

Note: the Historical *Forecast* API is not used for the day-ahead series. It stitches together the first hours of each
model run, so it is close to an analysis, not to the forecast someone could have seen a day earlier.

## Report schema (`data/validation/observed_waterlogging.json`)

```json
{
  "event_date": "2026-09-01",
  "place_name": "Main Road near the bus stand",
  "lat": 16.9512, "lon": 82.2391,
  "description": "knee-deep water on the main road for about 3 hours",
  "depth_reported": "knee",
  "source_url": "https://…",
  "source_type": "news",
  "collected_by": "…",
  "collected_on": "2026-11-23"
}
```

`source_type` is one of `news`, `official`, `team_visit`. Every entry needs a link or, for a team visit, a dated photo
kept by the team. The file ships **empty on purpose**: never add an entry you cannot source.

## Results

| Event date | Why chosen | Reports in pilot | Day-ahead forecast: hits | Actual rain: hits | Notes |
|---|---|---|---|---|---|
| (fill in) | | | | | |
