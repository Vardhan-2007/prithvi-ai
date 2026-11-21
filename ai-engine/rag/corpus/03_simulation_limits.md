---
id: doc-sim
title: What the 3D water simulation is and is not
publisher: PRITHVI AI team (project documentation)
url: docs/methodology.md
kind: project
---
The 3D water surface comes from a simplified two-dimensional shallow-water solver on a 12.5 m grid. Rain falls according to a triangular hyetograph that peaks at 40 percent of the chosen duration. Water flows downhill around building footprints, collects in low ground and leaves through proxy inlets, optional temporary pumps and an assumed downstream outfall.

The solver is uncalibrated. The terrain comes from a coarse 90 m surface model with depression filling, road cells are assumed to sit 0.15 m lower than their surroundings, and runoff coefficients are assumptions. Depths are scenario outputs for comparison only. They are not forecasts and must not be read as street-level flood depth.

Vertical exaggeration of 3 times is applied in the 3D view so that relief and shallow water are visible.
