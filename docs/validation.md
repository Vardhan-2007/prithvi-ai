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
* A report that names a **whole street or locality road** (it carries `osm_way_ids`) is a hit if a flagged zone's centre
  is within 150 m of **any part of that street** inside the pilot. Most news reports name streets, not spots, so this
  is the fair reading. It also means long streets are easier to hit than single spots, so read street hits as weaker
  evidence. The Replay tab marks them "whole street".
* A report covers every day from `event_date` to `event_end_date` (if given), so a two-day storm can be replayed on
  either day.
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

Optional fields: `event_end_date` (last day of a multi-day storm), `osm_way_ids` (street ids from the pilot dataset,
for street-level reports) and `location_method` (how the location was chosen).

`source_type` is one of `news`, `official`, `team_visit`. Every entry needs a link or, for a team visit, a dated photo
kept by the team. Never add an entry you cannot source.

## Reports collected so far (23 Nov 2026)

Collected from news before running the model on these dates. Each was located with the pilot's own OpenStreetMap
street data. No Google Maps lookup and no guessed coordinates were used.

| Event | Source | Places in the pilot (in the file) |
|---|---|---|
| Sun 28 Jun 2026, thunderstorm downpour | [Deccan Chronicle, 29 Jun 2026](https://www.deccanchronicle.com/southern-states/andhra-pradesh/downpour-floods-low-lying-areas-in-kakinada-rajamahendravaram-1966950) | Main Road; Sambamurthy Nagar |
| Mon–Tue 2–3 Nov 2026, rain from Cyclone Murasu | [Deccan Chronicle, 3 Nov 2026](https://www.deccanchronicle.com/southern-states/andhra-pradesh/rains-due-to-cyclone-murasu-inundate-godavari-districts-disrupt-power-supply-2001473) | Temple Street; Main Road; Sambamurthy Nagar |

Neither article gives a depth for these places. Both list several more places, which are **not in the file yet**
because their location could not be checked here. The team should look each one up in Google Maps and add it with its
lat/lon. Places outside the pilot are fine: the app counts them as *outside*.

* 28 Jun 2026: Municipal Office Road, Cinema Road, Jagannadhapuram.
* 2–3 Nov 2026: Cinema Street, RTC Complex, 100 Buildings, Dairy Farm, Jayendranagar, Mootha Nagar, Sashikanth Nagar,
  Mahalakshmi Nagar, Turangi, parts of Indrapalem. Also, from
  [UNI, 3 Nov 2026](https://www.uniindia.com/south-india/ap-kakinada-drain-destilting/235013): roads in Durga Nagar
  and the Narayana School area, after rainwater overflowed.
* 24 Sep 2026: [ETV Bharat](https://www.etvbharat.com/en/state/heavy-rains-wreak-havoc-across-coastal-andhra-as-floodwater-inundates-roads-homes-and-farmland-enn26092406582)
  reports water at about knee level around the **RTC Complex**, the only report found with a depth. It is worth
  adding once located.

Cyclone Montha (landfall near Kakinada on the night of 28–29 Oct **2025**) is the biggest recent event, but no report
naming streets inside the pilot was found, so it is not in the file.

## Results

| Event date | Why chosen | Reports in pilot | Day-ahead forecast: hits | Actual rain: hits | Notes |
|---|---|---|---|---|---|
| 2026-06-28 | Most recent heavy downpour with named streets in the pilot | 2 | (run and fill in) | (run and fill in) | street-level reports |
| 2026-11-02 / 03 | Cyclone Murasu rain; three pilot streets named | 3 | (run and fill in) | (run and fill in) | street-level reports; replay both days |
