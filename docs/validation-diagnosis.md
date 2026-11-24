# Validation diagnosis: why the first replays missed

*Written 2026-11-24. Dataset built 2026-11-21T18:55:38+00:00. Uses 19 reports from `data/validation/observed_waterlogging.json`, of which 7 lie inside the pilot (4 distinct places). Every number below is printed by `python gis-engine/validation_diagnosis.py`.*

The first replays ([validation.md](validation.md), Results) hit **0 of 4** reported streets on both days of the Murasu storm and **0 of 3** on the June thunderstorm. This page asks *why*, using only the data already in the repo. It does not run any new storm from the Replay tab.

## The question

The model says water collects in low ground. Do the places that people reported flooded actually sit on low ground in the terrain data? And does the model do better than a blind guess?

## A. Where the reported places sit in the terrain data

Height percentile = the share of the pilot's zones whose mean height is **lower** than this place. 0% = the lowest ground in the pilot, 100% = higher than everything. "At the pin" is the zone containing the reported spot; "whole street" averages the zones that the reported street(s) pass through.

| Place | Reports | At the pin | Whole street: zones touched | Whole street: height (mean, range) | Terrain-risk percentile |
|---|---|---|---|---|---|
| Main Road | 2 | **94%** | 16 | 91% (82% to 97%) | 8% |
| Temple Street | 1 | **99%** | 15 | 77% (2% to 99%) | 32% |
| Cinema Street / Cinema Road | 2 | **78%** | 1 | 78% | 21% |
| Sambamurthy Nagar | 2 | 38% | 3 | 36% (33% to 38%) | 58% |

(Terrain-risk percentile is the zone score from the terrain alone, where a low number means *less* susceptible.)

## B. Where the model says water collects

Two example storms, run through the backend's final (water-based) score with 25% of drains blocked. They are scenarios of similar size to the real storms, **not** the Replay tab's own runs (those used 20.6 mm and 54.6 mm of model rain).

| Storm | Zones flagged Higher or Highest | Mean height of flagged zones (pilot mean 5.61 m) | Flagged zones' height percentiles |
|---|---|---|---|
| 100 mm in 6 h | 15 | 3.04 m | 0, 0, 1, 3, 4, 4, 6, 7, 8, 8, 9, 10, 10, **59, 60** |
| 55 mm in 12 h | 5 | 2.15 m | 0, 0, 1, 4, 6 |

Distance from each reported place to the nearest flagged zone centre (a hit needs 150 m or less):

| Place | 100 mm / 6 h | 55 mm / 12 h |
|---|---|---|
| Main Road | **119 m (hit)** | 1,199 m |
| Sambamurthy Nagar | 320 m | 558 m |
| Temple Street | 361 m | 1,409 m |
| Cinema Street / Road | 678 m | 962 m |

Only 5 zones are flagged in both storms. Of the 15 zones flagged in the larger storm, 13 are in the lowest 10% of ground and 2 are not (the 59th and 60th percentiles).

## C. A plain terrain rule as a baseline

Flag the lowest N% of zones by height and count how many of the 4 places get a hit:

| Lowest zones flagged | Hits |
|---|---|
| 5% (14 zones) | 0 of 4 |
| 10% (27) | 0 of 4 |
| 20% (54) | 0 of 4 |
| 30% (82) | 1 of 4 |
| 50% (136) | 2 of 4 |

## D. The model against blind guessing

The Replay score counts a street as hit if *any* flagged zone centre lies within 150 m of *any point on the street*, so long streets are easy to hit. To see how easy, we flag the same number of zones **at random** (3,000 draws, fixed seed) and count hits:

| Storm | Model hits | Blind guess: mean hits | Draws with zero hits |
|---|---|---|---|
| 100 mm / 6 h (15 zones) | 1 of 4 | 2.69 | 0% |
| 55 mm / 12 h (5 zones) | 0 of 4 | 1.42 | 15% |

## What this shows

1. **Three of the four reported places sit on high ground in this data** (Main Road, Temple Street at the pin, and Cinema Road, at the 78th to 99th percentile), while the model flags the lowest ground (almost all flagged zones are in the bottom 10%). A model that sends water to low ground cannot reach them.
2. **Temple Street needs care.** The pin is on very high ground, but the street's two reported segments run through zones from the 2nd to the 99th percentile, so the street as a whole is mixed. Only the pin location is clearly high.
3. **The one place on lower ground, Sambamurthy Nagar (36% to 38%), is still missed by 320 m and 558 m.** The flagged zones are the very lowest ones, further east.
4. **A terrain-only rule does no better** (0 of 4 until nearly a third of the pilot is flagged). So the drain and water parts of the score are not what is failing here. Adding them does not help find these streets.
5. **With 15 flagged zones the model does worse than a random guess** (1 hit against a random mean of 2.69). With 5 flagged zones it cannot be told apart from chance (zero hits in 15% of random draws).

## What this does *not* show

- **It does not prove the terrain is wrong.** The terrain may be wrong at street scale (441 height points about 80 m apart, from a surface model; see [data-quality.md](data-quality.md)), **or** these streets may flood for reasons terrain cannot show: blocked or overloaded drains, water backing up, or water arriving from elsewhere. The data here cannot separate the two.
- **Only 4 places.** One place changes the picture. These are indications, not statistics.
- **Reporting bias.** News reports flooding where people are. There are no confirmed dry places to test false alarms.
- **Approximate pins.** Some locations come from map pins and street names, not surveys (see `location_method` in the data).

## What would settle it, cheapest first

1. **Measure the ground at the reported streets.** Spot heights along Main Road, Temple Street and Cinema Road compared with their neighbours (a levelling survey, a drone survey, or a better terrain source such as FABDEM at 30 m). If the streets turn out to be dips, terrain is the problem. If not, drains are.
2. **Get the drain records.** The municipal drain map and the complaint and desilting records for 2 to 3 Nov 2026. That tests the second explanation directly.
3. **Collect confirmed dry places** for the same days, so false alarms can be counted.
4. **Use gauge rainfall** instead of model rain (see [validation-plan.md](validation-plan.md)).

## Reproduce

```bash
python gis-engine/validation_diagnosis.py            # all tables (runs the flood solver twice, about 30 s)
python gis-engine/validation_diagnosis.py --no-sim   # tables A and C only
```

If the dataset or the reports change, rerun it and update the numbers above. A test fails when this page's dataset stamp or report count no longer matches the data.
