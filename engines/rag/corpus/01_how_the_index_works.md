---
id: doc-index
title: How the PRITHVI AI risk index works
publisher: PRITHVI AI team (project documentation)
url: docs/methodology.md
kind: project
---
The risk index is a relative score from 0 to 100 calculated for every 100 m analysis zone. It combines four factors that are each normalised to a 0 to 1 range: terrain susceptibility, the rainfall scenario, drainage vulnerability and exposure.

The provisional weights are 0.30 for terrain, 0.25 for rainfall, 0.25 for drainage and 0.20 for exposure. These weights are design assumptions chosen for the prototype. They are not calibrated against historical flood events.

The index is not a flood probability and not a flood depth. It only ranks zones relative to each other under the selected assumptions. A higher index means the terrain, rainfall input, drainage assumption and mapped assets together make the zone a stronger candidate for attention.

Display bands are Lower (below 35), Moderate (35 to 48), Higher (48 to 60) and Highest relative index (60 and above). The band thresholds are display choices, not hazard thresholds.
