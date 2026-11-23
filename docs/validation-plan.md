# Validation plan

**Status: a plan, not a result.** Nothing in this file has been run. It says how we could test the flood model against a real event, which events and data look usable, what is missing, and what has to change in the app first. Written 2026-11-23.

Until this plan has been carried out, every claim about the model stays as the app says now: *a scenario, not a forecast; uncalibrated depths; indicative index.* See [limitations](limitations.md) and the data-quality report (`docs/data-quality.md`, proposed on its own branch and not merged yet).

## 1. The problem in plain words

The model says where water would collect for a rainfall we choose. We have never checked it against a storm that really happened, so we cannot say whether it is roughly right, badly wrong, or only right for the wrong reasons. A fair test needs three things: a real storm with a known rainfall, a record of where water really stood, and a score that says how well the two match.

## 2. What "validated" could mean (three levels)

| Level | Question | Needs | Realistic soon? |
|---|---|---|---|
| 1. Where | Does the model put water in the places that really flooded, and keep it out of places that stayed dry? | Wet/dry observations at known places | Yes |
| 2. How deep | Are the depths about right? | Measured depths or water marks | Hard, few measurements exist |
| 3. When | Does water arrive and leave at about the right times? | Time-stamped observations | Partly (photos and videos carry times) |

**We aim for level 1 first**, scored at points (this street was wet, that one dry), because polygons of urban flooding do not exist for this area (see section 4).

## 3. Candidate events

| Event | What happened (from sources, see section 12) | Fit for this model |
|---|---|---|
| **Cyclone Murasu, 2 to 3 Nov 2026** | News of 3 Nov 2026 reports heavy rain over Kakinada and nearby districts, low-lying areas under water, roads reported knee-deep, and rainwater mixed with drain water entering shops, houses and schools. It names 13 Kakinada localities as waterlogged: Temple Street, Cinema Street, Main Road, RTC Complex, 100 Buildings, Sambamurthy Nagar, Dairy Farm, Jayendranagar, Mootha Nagar, Sashikanth Nagar, Mahalakshmi Nagar, Turangi and parts of Indrapalem. | **Best candidate.** Recent (photos, videos, complaints still findable), rain-driven, and named streets exist. **Gap:** no Kakinada rainfall figure found yet. The state list of rainfall totals (8:30 AM 2 Nov to 6:00 AM 3 Nov) does not include Kakinada. |
| **Cyclone Montha, 28 to 30 Oct 2025** | Reported to have made landfall near Kakinada on 28 Oct 2025, with a storm surge of up to about 3 m reported along the coast. Satellite radar maps exist (see below). | **Poor for this model.** Flooding may be driven by the sea, which the model does not represent (it has a fixed outlet height and no tide or surge). The satellite maps show rural inundation, not the town (section 4). |
| **Cyclone Michaung, Dec 2023** | A report of 5 Dec 2023 gave 99 mm in 24 h for Kakinada district. | **Possible second event.** Needs checking: district figure, not a city gauge, and not verified. |
| **Ordinary heavy-rain days** | Local news reports waterlogging after non-cyclone downpours (one bulletin gave 42 mm in 24 h for Kakinada urban). | **Useful as a second test** where drains, not the sea, decide the outcome. Hard to find observations. |

**Why two events matter:** tune on one, test on the other. Tuning and testing on the same storm only proves the model can be bent to fit it.

**Check first:** does our pilot box actually contain the flooded streets? Names in our dataset that match the Murasu list: `Sambamurthi Nagar Road No 1` (spelling differs), `Temple Street`, `Kakinada Main Road`. The other ten localities do not appear by name in our roads or facilities. That does not mean they are outside the box (many streets carry no name in the map data), but it must be checked on a map before we commit to this event.

## 4. Observation sources

Evidence column: **R** = I read the document itself; **S** = I only saw it in search results.

| Source | What it gives | Fit for city street flooding | Evidence |
|---|---|---|---|
| **Photos and videos** of flooded streets (news, residents, municipal social media), with a place and a time | Wet/dry points, rough depth class (ankle, knee, vehicle), and time | **Best available.** Biased toward where people are and what gets posted | n/a |
| **Municipal and disaster-authority records**: complaint logs, desilting records, situation reports | Where help was requested; drain condition and cleaning dates | High if obtainable. Needs a request | S (a 3 Nov 2026 news item reports drain desilting by the municipal corporation) |
| **Post-event field survey**: mud lines, shop-front water marks, resident interviews | Depths at points | High, but fades within days to weeks, so for Murasu it is already late | n/a |
| **NRSC / APSAC satellite flood layers** (Bhuvan, NDEM portals) | District-level inundation from radar, as GIS layers | **Low for the town.** Montha tables list rural mandals only (see below) | **R** |
| **Copernicus Global Flood Monitoring** (Sentinel-1) | Flood extent at 20 m, available within hours of each pass | Low to medium in dense towns: radar struggles there (see risks) | S |
| **Sentinel-1 / Sentinel-2 raw scenes** (free) | Our own water mapping | Same radar limits; optical is blocked by cloud during a cyclone | S |
| **Copernicus rapid mapping (EMS)** | Detailed event maps when activated | Our search found none for Kakinada (EMSR104 is a 2014 Andhra Pradesh activation) | S |

**What the Montha satellite documents say (read in full):**
- RISAT-1A radar data of **28 Oct 2025 18:00** and Sentinel-1A of **2 Nov 2025 06:00** were used. Water is found by comparing radar backscatter before and after the event. The layers are published on NRSC's Bhuvan and NDEM portals and sent to the state disaster authority as GIS files.
- Kakinada district totals: 232 ha (28 Oct, partial coverage), 292.71 ha (layer of 30 Oct, APSAC table), 225.84 ha (2 Nov, APSAC table). For scale, our whole pilot box is about 266 ha.
- The mandal tables list Thondangi (192.07 ha on 30 Oct; 180.43 ha on 2 Nov), Pedapudi, Samalkota, Karapa, Tuni, Sankhavaram and a few more. **They list no area for Kakinada (Urban) or Kakinada (Rural).**
- NRSC itself warns that the mapped water may include wet ground and rainwater pooling in low-lying land, and that the area estimate depends on the sensor's resolution and coverage.

**What follows:** these layers cannot confirm or deny flooding inside the town. "No area listed" is not the same as "no flooding".

## 5. The rainfall problem

Our model needs rainfall over time. What we have found so far:
- IMD city pages give Kakinada rainfall as one daily total (8:30 AM to 8:30 AM). That is too coarse for a storm that peaks in a few hours.
- The state's weather portal shows live rainfall from many stations as 24-hour and cumulative totals, but we found no download of hourly data. (S)
- **First task: ask for the hourly rainfall series** for 2 to 3 Nov 2026 at or near Kakinada, from IMD's regional office or the state disaster authority, and ask which gauge it comes from.
- Fallback: satellite rainfall estimates (about 0.1 degree and 30 minutes). Too coarse in space for a 1.6 km box, but they give the timing of the storm.

If we cannot get at least a few hours of resolved rainfall, we cannot score the model fairly, and we should say so.

## 6. Method

1. **Fix the event and window**, and write down which streets we expect to be inside the pilot box.
2. **Collect observations**: build a table of points: place (latitude and longitude), time, wet or dry, depth class, source link. Aim for at least 30 to 50 points with some dry ones. Record each source, and keep out personal details (no names or faces).
3. **Get the rainfall series** (section 5). Record where it came from.
4. **Replay the storm in the model** with the real rainfall shape (needs the app change in section 8).
5. **Cut a fair test**: set aside some observation points before any tuning.
6. **Tune lightly** on the first event only. Parameters that are assumptions today: runoff share on soil (0.55), inlet capacity (0.25 m³/s each), outfall height (0.30 m), recession time (1 h), road dip (0.15 m), and the blocked share of drains. Report the model's answers across a range of blockage values, since no one knows the real figure.
7. **Test on the second event** with parameters fixed, then score and write the result up, whatever it shows.

## 7. Scoring

For each point, compare "model says wet" with "observed wet". Count: hits (TP), misses (FN), false alarms (FP).
- Probability of detection = TP / (TP + FN)
- False alarm ratio = FP / (TP + FP)
- Critical success index (CSI) = TP / (TP + FN + FP)

(These are the standard definitions for judging flood models against observations; see the metrics paper in section 12.)

**Always beat a dumb baseline.** A flood model is only useful if it scores higher than very simple rules, for example "wet if the ground is in the lowest quarter of the pilot area" or "wet at random". We report the model next to these, so a good-looking number cannot hide a model that adds nothing.

**Do not copy published scores as targets.** Reported CSI values for flood models differ a lot with the reference data and with how built-up the area is (the examples I saw were second-hand and range from about 0.2 to about 0.8). We should decide our own thresholds in advance and write them down before we see results. A starting proposal for the team to argue about: call the model "indicatively useful" only if it beats both baselines on the test event and finds most of the observed wet points; say "not useful yet" if not.

## 8. What must change in the app first

| Needed | Why | Who decides |
|---|---|---|
| **Replay a real rainfall series** instead of the fixed symmetric triangle | The model cannot reproduce a real storm today. The handover lists a storm-shape selector as offered to the owner and not decided. | Govardhan |
| **Export model depth at given points** (or a wet/dry map) | Needed for scoring | Small change |
| **Tide or surge option** (only if we use Montha) | Without it, a sea-driven event cannot be tested | Probably out of scope |

The solver and the risk index must change in both languages, with tests, as the repo rules require.

## 9. Risks and biases

- **Radar misses urban water.** Over built-up ground, radar can read flooded streets as bright instead of dark, and buildings can hide the ground from the sensor. Studies report better results when radar is combined with coherence or terrain data. So absence in a satellite map is weak evidence of dry streets. (S)
- **Reporting bias.** Flooding gets photographed where people are, so dry places are under-recorded. We need some confirmed dry points, for example from people who live there.
- **Our own inputs are weak** (see the data-quality report): terrain is a coarse surface model with whole-metre steps, only 472 buildings are mapped, and the drains are placed by us. A poor score may reflect missing data and not a bad model. Likewise a good score on one event does not prove the model is right.
- **Drain state on the day is unknown.** Treat blockage as a range, never one number.
- **Surge and river flooding** are not in the model. Events dominated by them cannot test it.
- **Small samples.** With few points, one event can swing the score. Report the counts, not just percentages.

## 10. Decisions the team needs to make

1. Which event is the main one (we suggest Murasu) and which is the second.
2. Who asks IMD or the state disaster authority for hourly rainfall, and who asks the municipality for complaint and desilting records.
3. Whether to approve the rainfall-replay change (section 8) and its timing.
4. Who collects and checks observation points, including dry ones, and how we credit and store them.
5. The pass mark, agreed before looking at any result.

## 11. Rough effort (a guess, not a commitment)

- Data requests and waiting: one to three weeks of elapsed time, little work.
- Building the observation table: two to three days.
- Rainfall replay in both languages with tests: one to two days.
- Runs, scoring and write-up: two to three days.

## 12. Sources and how well they were checked

**Read in full by me (the documents themselves):**
- NRSC report on Cyclone Montha, RISAT-1A, 28 Oct 2025: https://apsac.ap.gov.in/wp-content/uploads/2025/10/28-10-2025/NRSC/AP_2025_28_10_1800_Report.pdf
- NRSC report on Cyclone Montha, Sentinel-1A, 2 Nov 2025: https://apsac.ap.gov.in/wp-content/uploads/2025/11/02-11-2025/NRSC/AP_2025_02_11_0600_Report.pdf
- APSAC mandal table, Kakinada district, 30 Oct 2025: https://apsac.ap.gov.in/wp-content/uploads/2025/10/30-10-2025/APSAC/Kakinada_Dst_Flood_Inundation_Mandals.pdf
- APSAC mandal table, Kakinada district, 2 Nov 2025: https://apsac.ap.gov.in/wp-content/uploads/2025/11/02-11-2025/APSAC_0600/Kakinada_Dst_Flood_Inundation_Mandals_021125_0600.pdf

**Read by a helper tool that summarised them for me (check before quoting):**
- Deccan Chronicle, Cyclone Murasu in the Godavari districts (update stamp 3 Nov 2026): https://www.deccanchronicle.com/amp/southern-states/andhra-pradesh/rains-due-to-cyclone-murasu-inundate-godavari-districts-disrupt-power-supply-2001473
- The Hans India, rainfall totals across Andhra Pradesh (3 Nov 2026): https://www.thehansindia.com/andhra-pradesh/cyclone-murasu-heavy-rainfall-recorded-across-andhra-pradesh-naguluppalapadu-tops-list-with-19801-mm-1138781

**Seen only in search results, not opened (treat as leads):**
- Cyclone Murasu landfall reports: https://aljazeera.com/news/2026/11/3/cyclone-murasu-makes-landfall-on-indias-eastern-coast
- Cyclone Montha landfall and surge reports: https://www.newsonair.gov.in/cyclone-montha-makes-landfall-in-andhra-pradesh-causes-widespread-damage-and-flooding
- Cyclone Michaung, Dec 2023 (Kakinada 99 mm in 24 h): https://telanganatoday.com/cyclone-michaung-devastates-ap
- Kakinada drain desilting (3 Nov 2026): https://www.uniindia.com/south-india/ap-kakinada-drain-destilting/235013
- Copernicus Global Flood Monitoring: https://global-flood.emergency.copernicus.eu/news/107-global-flood-monitoring-product-launch/ and https://tuwien.at/en/mg/geo/rs/open-data/gfm
- Copernicus rapid mapping EMSR104 (2014, Andhra Pradesh): https://mapping.emergency.copernicus.eu/activations/EMSR104
- NRSC portals named in the Montha reports: https://bhuvan-app1.nrsc.gov.in/disaster/disaster.php?id=flood and https://ndem.nrsc.gov.in
- State weather portal: https://apsdmagis.ap.gov.in/weather-watch/index.html and IMD Kakinada city page: https://city.imd.gov.in/citywx/citywxnew.php?id=43189
- Radar limits in urban flood mapping: https://centaur.reading.ac.uk/129182/9/026510_1.pdf and https://isprs-annals.copernicus.org/articles/X-G-2025/847/2025/
- Flood-model scoring measures: https://arxiv.org/pdf/2408.00571

**Unverified details to confirm before relying on them:** the Montha landfall place and surge height; the Michaung district rainfall and the 42 mm figure for an ordinary heavy-rain day; the municipal desilting report; which Murasu localities lie inside our pilot box; and the exact modes of the RISAT-1A passes (the report text was read from a font-encoded PDF and a few letters came out garbled).
