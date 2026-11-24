# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed
- **Timeline:** the row of eight number boxes is replaced by one plain sentence about what is happening (English / Telugu).
- **Storm shape:** the rain is now a symmetric triangle that peaks at the midpoint of the duration (previously at 40 %) and falls to zero at the end.
- **Flood recession:** after the rain stops, standing water recedes with a 1 h time constant (assumed; counted as drained volume). Previously, pockets walled in by building footprints held water for ever (about 2.5 ha still flooded three hours after the rain). Peak depths and peak flooded areas during the rain are unchanged in kind (e.g. 200 mm / 4 h / 50 % blocked: peak 24.0 ha at T+2:14).
- Browser and NumPy solvers updated together; tests now require the peak at the midpoint, a symmetric curve, receding water and a closed mass balance (32 Python + 9 web tests).
- Assistant corpus and methodology updated to describe both changes.

### Added
- **Drains tab:** an indicative ranking of which drains are most likely to block (terrain, built-up surroundings, spacing; assumed weights) and which matter most if they do. Colours the drains on the 3D and 2D maps, flies to a selected drain, and can assume the k likeliest drains block. Not a prediction: no real drain or blockage records exist for the area.
- Deployment: `Dockerfile`, `render.yaml`, single-flight guard (HTTP 429) on the slow `simulate` endpoint, live demo links.
- `docs/prototype-guide.md` and the PDF study guide `docs/PRITHVI-AI-study-guide.pdf`.

## [0.1.0] — 2026-11-22
First public prototype.

### Added
- Real-time 3D digital twin of a central Kakinada pilot area: OSM buildings and roads, shaded flowing flood water, rain, sun shadows, drain inlets and facilities.
- Scenario controls (rainfall, duration, drainage blockage, per-inlet blocking, temporary pumps), timeline playback and live statistics.
- Explainable risk index per 100 m zone, baseline-vs-scenario comparison, exposure overlay, priority ranking and road-route analysis.
- 2D map (MapLibre) with peak flood cells; navigation pad with compass in both views.
- Evidence assistant (extractive BM25 with citations and abstain), English / Telugu UI.
- FastAPI backend (11 routes), NumPy reference flood solver, data pipeline (OSM + Copernicus GLO-90), provenance metadata.
- Tests: risk index, TypeScript↔Python parity, solver mass conservation, RAG, API (30 Python + 4 web).
