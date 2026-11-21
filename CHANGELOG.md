# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/).

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
