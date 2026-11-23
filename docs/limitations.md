# Limitations (also shown in the app: "Data & limits" tab)

1. The index is a relative score — not a flood probability and not a depth.
2. Rainfall is a user-defined scenario applied uniformly. No forecast, no event calibration.
3. Drain inlets are proxies; blockage is a sensitivity assumption. No drainage inventory was available.
4. Terrain is a ~90 m surface model (includes buildings/trees); sub-metre relief, kerbs and culverts are unresolved. OSM is incomplete here; many building heights are proxies.
5. The 3D water comes from an uncalibrated simplified solver. No accuracy is claimed.
6. Telugu text is a first draft and needs review by a Telugu speaker. The assistant answers in English source wording.
7. Not an alert system, not an evacuation tool, not a substitute for IMD / NDMA / local authorities.
8. **The index and the 3D solver are two different models and they only partly agree.** Comparing the index with the solver's mean peak depth per 100 m zone (100 mm over 6 h) gave a rank correlation of about 0.26 and a 33% overlap of the top-10% zones. The solver's flooding concentrates in a few local depressions of a coarse terrain model, so one point sink (a pump) can remove almost all of it (10.9 ha to 0.2 ha with 6 pumps), while the index moves by about 3%. Treat the two outputs as independent illustrations, not as confirmation of each other.
9. Zone rankings now depend on the rainfall amount through the drainage term, but the 0.5 to 1.0 scaling of that term and the bands (35 / 48 / 60) are still design assumptions, not calibrated values.
