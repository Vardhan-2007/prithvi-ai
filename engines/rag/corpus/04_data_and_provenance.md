---
id: doc-data
title: Data sources used by the pilot
publisher: PRITHVI AI team (project documentation)
url: data/metadata/layers.yaml
kind: project
---
Buildings, roads, facilities and water bodies come from OpenStreetMap contributors through the Overpass API under the ODbL licence. OpenStreetMap coverage varies, so the pilot area is probably under-mapped, and many buildings use a proxy height of two to four storeys.

Terrain comes from the Copernicus GLO-90 digital surface model sampled through the Open-Meteo elevation service at roughly 90 m posting. It is smoothed, resampled to 12.5 m and depression-filled. It cannot resolve kerbs, culverts or underpasses.

Rainfall is always a user-defined scenario. NASA GPM IMERG is listed as a future calibration source, but its native resolution is far coarser than street level.

Every layer is labelled observed, derived, proxy or simulated in the Data and limits tab.
