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

## Reports collected so far (24 Nov 2026)

19 reports from 4 events, all collected from news before running the model on these dates. Locations come from the
pilot's OpenStreetMap streets, Google Maps place pins (looked up 24 Nov 2026) or, for Indrapalem, Wikipedia. Each
entry's `location_method` says which, and flags approximate ones. Only **7 of the 19 are inside the 1.6 km pilot**.
The rest are counted as *outside* by the app: they show where Kakinada floods beyond the pilot, which is the case for
growing the area.

| Event | Source | Inside the pilot | Outside the pilot |
|---|---|---|---|
| Mon–Tue 2–3 Nov 2026, rain from Cyclone Murasu | [Deccan Chronicle, 3 Nov 2026](https://www.deccanchronicle.com/southern-states/andhra-pradesh/rains-due-to-cyclone-murasu-inundate-godavari-districts-disrupt-power-supply-2001473) | Temple Street, Main Road, Sambamurthy Nagar, Cinema Street | RTC Complex, 100 Buildings, Dairy Farm, Jayendra Nagar, Mootha Nagar, Sashikanth Nagar, Mahalakshmi Nagar, Turangi, Indrapalem |
| Wed 28 Oct 2026, Cyclone Arnab | [Myanmar ITV, 28 Oct 2026](https://www.myanmaritv.com/news/floods-hit-streets-indias-kakinada-after-cyclone-arnab-makes-landfall) | none | Kakinada Anchorage Port (likely storm surge, not modelled) |
| 24 Sep 2026, heavy rain | [ETV Bharat, 24 Sep 2026](https://www.etvbharat.com/en/state/heavy-rains-wreak-havoc-across-coastal-andhra-as-floodwater-inundates-roads-homes-and-farmland-enn26092406582) | none | RTC Complex (knee-deep, the only report with a depth) |
| Sun 28 Jun 2026, thunderstorm downpour | [Deccan Chronicle, 29 Jun 2026](https://www.deccanchronicle.com/southern-states/andhra-pradesh/downpour-floods-low-lying-areas-in-kakinada-rajamahendravaram-1966950) | Main Road, Sambamurthy Nagar, Cinema Road | Jagannadhapuram (Jagannaickpur) |

Judgement calls (also written in each entry):

* **Cinema Street (3 Nov)**: Google Maps has no road by that name in Kakinada, so it is placed on Cinema Road, the
  name the same paper used in June. Assumed, not certain.
* **100 Buildings, Mootha Nagar, Mahalakshmi Nagar**: two nearby pins or a single user-added pin. Approximate.
* **Indrapalem**: village centre; the report says only "parts of Indrapalem".

Not added, and why:

* **Municipal Office Road (28 Jun)**: no road by that name in Google Maps, and several different municipal offices.
  Ambiguous.
* **Bombay Katta (28 Oct)**: not found in Google Maps.
* **Pagadala Peta (28 Oct)**: found (Pagadalapeta, 16.9193, 82.2381), but the source ([ANI via the Daily Pioneer live
  blog](https://dailypioneer.com/india/cyclone-arnab-live-very-severe-storm-set-to-cross-andhra-coast-near-yanam-on-october-28))
  calls it "worst-affected" without saying it was waterlogged.
* **Durga Nagar, Narayana School area (3 Nov)**, from
  [UNI](https://www.uniindia.com/south-india/ap-kakinada-drain-destilting/235013): not yet checked against the article.

Cyclone Montha (night of 28–29 Oct **2025**) is not included: no street-level report was found.

## Results

| Event date | Why chosen | Reports in pilot | Day-ahead forecast: hits | Actual rain: hits | Notes |
|---|---|---|---|---|---|
| 2026-11-02 | Cyclone Murasu rain; four pilot streets named | 4 (+9 outside) | 0 of 4 (12 mm) | 0 of 4 (20.6 mm) | same 4-5 zones flagged in every run, 558 m or more from the reports |
| 2026-11-03 | same storm, second day | 4 (+9 outside) | 0 of 4 (19.1 mm) | 0 of 4 (54.6 mm) | also 0 of 4 with 75 % of drains blocked: blockage is not the cause |
| 2026-10-28 | Cyclone Arnab, the year's biggest event | 0 (+1 outside) | n/a (79.1 mm) | n/a (50 mm) | nothing inside the pilot to score |
| 2026-09-24 | only report with a depth | 0 (+1 outside) | n/a | n/a | nothing inside the pilot to score |
| 2026-06-28 | thunderstorm downpour | 3 (+1 outside) | 0 of 3 (13.8 mm) | 0 of 3 (7.3 mm) | model rain far too low for a local thunderstorm |

Run on the live site on 24 Nov 2026, with 25 % drain blockage unless noted.

**What the misses say.** Every run flags the same few low-lying zones, 558–1,540 m from the reported streets, whatever
the rain or the blockage. Three causes, most important first:

1. **Ground heights are too coarse.** The terrain comes from 441 height points on a ~90 m grid, so the low spots of
   individual town-core streets (Main Road, Temple Street, Cinema Road) are not in the data. This is the main limit.
2. **Model rain is smoothed.** The 9–25 km rain products spread a storm over the day (54.6 mm in 24 h is about
   2 mm/h), while street flooding comes from short, intense bursts.
3. **Drain capacity is assumed.** The inlets are proxies with a fixed capacity; real clogging is not known.

Next steps that address these, in order: finer ground data (FABDEM or a 30 m DEM), real drain locations, and rain-gauge
or radar rain for replays. The point of this check is that it is now possible to measure, and it shows exactly where
the model needs work.
