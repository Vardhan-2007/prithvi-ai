---
id: doc-live
title: Live mode and forecast-driven scenarios
publisher: PRITHVI AI team (project documentation)
url: docs/live-mode.md
kind: project
---
Live mode drives the scenario from the real hourly rain forecast for the next 24, 48 or 72 hours instead of the rain sliders. The forecast is the ECMWF IFS 0.25 degree ensemble from the Open-Meteo Ensemble API, which has 51 members.

Live mode is a forecast-driven planning scenario. It is not an official forecast and not a flood warning. Official weather and flood warnings come from the India Meteorological Department, NDMA and the district administration.

The low, likely and high cases are the ensemble members at the 10th, 50th and 90th percentile of total rain over the chosen window. Whole members are used so that each case is a storm shape the model actually produced. The panel also shows the full range of rain across all members.

The forecast grid is about 25 km, so the whole pilot area sits inside one grid cell and the forecast rain is the same everywhere in it. Thunderstorm timing and location are uncertain. The flood model underneath is still uncalibrated, so Live mode shows what a forecast could mean for the streets, not what will happen.
