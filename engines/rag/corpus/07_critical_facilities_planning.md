---
id: doc-facilities
title: Reading the facilities and road-exposure results
publisher: PRITHVI AI team (project documentation)
url: docs/methodology.md
kind: project
---
Facilities shown are those mapped in OpenStreetMap: hospitals and clinics, fire and police stations, and schools or places of worship that could be shelter candidates. Their capacity, current status and suitability as shelter are unknown to the prototype.

A facility or road segment is listed as exposed when it lies inside a zone in the Higher or Highest index band under the current scenario. That is an overlay of mapped assets on indicative zones. It does not mean the asset is flooded or unusable.

The road route analysis removes road segments whose simulated peak water depth exceeds a threshold you choose, then looks for the shortest remaining path between two facilities. It is a graph-based scenario analysis. It is not a certified safe route and must not be used for navigation or dispatch.
