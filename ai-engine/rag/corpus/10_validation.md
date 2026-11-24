---
id: doc-validation
title: How PRITHVI AI is checked against real flooding
publisher: PRITHVI AI team (project documentation)
url: docs/validation.md
kind: project
---
The Replay tab replays a past day's storm through the flood model and compares the result with waterlogging that was actually reported, such as news reports with a location. This is the project's check of accuracy against the real world, separate from its internal consistency tests.

For a chosen date, PRITHVI loads two rain series: the forecast issued the day before, from the Open-Meteo Previous Runs archive (available from January 2024), and the rain that fell, from the ECMWF and ERA5 reanalysis archive. Both are model products, not rain-gauge records.

A reported spot counts as a hit if a zone flagged Higher or Highest by the final score lies within 150 metres of it. Flagged zones with no report nearby are not called false alarms, because a missing news report does not mean there was no flooding.

The team chooses the event and collects the reports before looking at the model output, and reports the result whatever it shows. How accurate is PRITHVI AI? The honest answer is the hit rate from these replays. Until replays are recorded in docs/validation.md, no accuracy figure is claimed.
