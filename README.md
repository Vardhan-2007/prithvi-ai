# PRITHVI AI — Neighbourhood Risk Digital Twin

> **Experimental planning and visualisation prototype.** Scores are indicative indices based on the selected data and assumptions.
> They are not official forecasts, flood-depth estimates, evacuation instructions or a substitute for local authorities.

A real-time **3D digital twin** of a pilot neighbourhood (central Kakinada, ~1.6 × 1.7 km). Change rainfall and drainage assumptions
and watch the simulated water, the buildings/roads it reaches, and a transparent risk index respond — then compare against a baseline,
see *why* each zone scores the way it does, and read the data sources and limitations.
Built for HackWithAditya 2026 · theme **Smart Infrastructure & Water** (pack: `PRITHVI_AI_HackWithAditya_Complete_Project_Pack.zip`).

## Run it

```bash
make data      # optional - processed data is already committed in data/processed (re-fetches OSM + DEM if data/raw is empty)
make web       # 3D twin  ->  http://127.0.0.1:5173      (needs Node 18+)
make api       # optional FastAPI ->  http://127.0.0.1:8000/docs   (pip install -r backend/requirements.txt)
make test      # 30 Python tests + 4 TypeScript tests + typecheck
```
The web app works on its own (in-browser engine). When the API is running the header shows **API online** and the assistant answers through it.

## What's in the prototype (pack P0 + most of P1)

| Pack requirement | Where |
|---|---|
| Pilot-area map, ≥2 layers, layer controls | **3D Digital Twin** + **2D Map** (MapLibre); layer panel (left) |
| Baseline score with visible factor contributions | *Risk index* heat-map; **Zone** tab (T · R · D · E, weighted points, baseline marker) |
| Scenario controls (rainfall, drainage blockage, mitigation) | Left panel: 4 presets, sliders, per-inlet click-to-block, temporary pumps |
| Baseline vs scenario comparison | **Compare** view (baseline / scenario / Δ) + Overview (bands, mean index, zones moved up) + 16-scenario library |
| Exposure overlay: roads & critical facilities in flagged zones | **Overview → Exposure**; flooded buildings/roads/facilities counted live in the timeline strip |
| Explainability panel | **Zone** tab: sentences generated from the numbers (English / Telugu) |
| Data provenance + limitations | **Data & limits** tab (source, licence, resolution, processing, status: observed/derived/proxy/simulated) |
| Priority ranking, CSV/JSON export | **Priority** tab, Overview export buttons |
| Road-network analysis (graph-based, not "safe route") | **Routes** tab; route drawn in 3D |
| RAG assistant with citations + abstain | **Assistant** tab (`ai-engine/rag`, extractive BM25, demo corpus) |
| English + Telugu | `EN / తె` toggle (Telugu draft needs human review) |
| Real-time 3D simulation | Web-Worker shallow-water solver → shaded flowing water with rain ripples and shore foam, rain, wet roads, hotspot depth pins, scrubbable timeline |
| Realistic 3D scene | OSM buildings with textured facades, roofs and lit windows; lane-marked roads with pavements; sun shadows; sky lighting. Terrain relief is exaggerated ×3, buildings and water depth are true size. Trees are decoration only (no tree data) |

## Controls

| | 3D Digital Twin | 2D Map |
|---|---|---|
| Rotate | left-drag · **⟲ ⟳** buttons · `Q`/`E` · `←`/`→` | right-drag or Ctrl-drag · **⟲ ⟳** |
| Tilt | `↑`/`↓` · **▲ ▼** (top-down ↔ street level) | right-drag up/down · **▲ ▼** |
| Pan | right-drag or Shift-drag · `W A S D` | left-drag |
| Zoom | scroll · **＋ －** (hold to repeat) | scroll · **＋ －** |
| Fly to a spot | double-click the ground | – |
| **Compass** | the dial rotates with the view and shows the heading; click it (or press `N`) to face north | same |
| Reset / top-down | **⌂** / **⊞** · `0` / `T` | same |

The camera cannot leave the model, so you cannot get lost; **⌂** always brings you back.

## Honest status of the data and model

* **Observed:** buildings, roads, facilities, water bodies — OpenStreetMap (ODbL). Coverage is thin here (472 footprints), and the UI says so.
* **Derived:** terrain — Copernicus GLO-90 (~90 m *surface* model) via Open-Meteo, smoothed, resampled, depression-filled.
* **Proxy:** storm-drain inlets (56) — **no drainage inventory exists in the data**; they are evenly spread along roads. Blockage is a sensitivity assumption.
* **Simulated:** rainfall is user-defined; the water solver is simplified and **uncalibrated** — no accuracy is claimed (no ground-truth flood extents). It is validated only for mass conservation, determinism, monotonicity and agreement between its TypeScript and NumPy implementations.
* The assistant's corpus is a **demo corpus** of short team-written summaries (see `ai-engine/rag/corpus/`). Replace it with extracts of official documents you may use.

Details: [`docs/methodology.md`](docs/methodology.md) · [`docs/architecture.md`](docs/architecture.md) · [`docs/data-sources.md`](docs/data-sources.md) · [`docs/limitations.md`](docs/limitations.md) · [`docs/demo-script.md`](docs/demo-script.md)

## Repository structure

Same categories as the team's reference layout: **frontend**, **backend**, **gis-engine**, **ai-engine**, **data**, **docs**.

```
prithvi-ai/
│
├── frontend/                          React + TypeScript + Vite + Three.js + MapLibre
│   ├── public/data/                   pilot dataset + assistant corpus served to the browser
│   ├── scripts/                       scenario-report.ts, export-reference.ts (TS↔Python parity fixture)
│   └── src/
│       ├── components/                header, NavPad (compass + zoom/rotate/tilt), i18n (EN/తె), api client
│       ├── maps/
│       │   ├── twin3d/                3D digital twin: scene/ (Three.js) + sim/ (Web Worker flood solver)
│       │   └── map2d/                 2D map (MapLibre) and the baseline/scenario Compare view
│       ├── dashboard/
│       │   ├── risk/                  overview, zone explanation, priority, routes, exports
│       │   ├── timeline/              playback + live stats strip
│       │   ├── assistant/             cited Q&A (browser fallback retrieval)
│       │   └── provenance/            data sources + limitations
│       ├── scenarios/                 scenario controls + engine/ (risk index, routing, dataset, types)
│       └── App.tsx · main.tsx · store.ts · styles/
│
├── backend/                           FastAPI
│   ├── api/                           routes
│   ├── models/                        request schemas (schemas.py) + PostGIS schema (schema.sql)
│   ├── services/                      dataset loading, scenarios, assistant
│   ├── simulation/                    NumPy virtual-pipe flood solver (reference for the 3D twin)
│   ├── tests/                         API + solver tests
│   └── main.py · config.py · requirements.txt
│
├── gis-engine/
│   ├── terrain/                       DEM download, smoothing, depression filling
│   ├── processing/                    OSM download/parse/rasterise, proxy inlets, provenance, build_pilot_dataset.py
│   ├── risk_analysis/                 per-zone terrain / imperviousness / exposure indicators
│   └── gis_config.py                  pilot bounding box, grid, projection
│
├── ai-engine/
│   ├── risk_scoring/                  explainable risk index (+ tests incl. TS parity)
│   └── rag/                           retrieval, answer, ingest, corpus/ (demo documents), tests
│
├── data/
│   ├── sample/                        (reserved)
│   ├── processed/                     pilot_kakinada_01.json, corpus.json, layers.yaml (provenance)
│   └── raw/                           cached downloads (git-ignored; re-created by `make data`)
│
├── docs/                              architecture, methodology, data-sources, limitations, api-contract, demo-script
│   └── contracts/                     openapi.json + JSON Schemas
│
├── docker-compose.yml · Makefile · pytest.ini · .env.example · NOTICE.md · README.md
```

## Tech stack, hardware, dependencies (for the submission form)
React 18, TypeScript, Vite, Three.js, MapLibre GL, Zustand · Python 3.12+, FastAPI, NumPy, Pydantic · Overpass API, Open-Meteo elevation (Copernicus GLO-90).
Runs on a laptop; WebGL required. Internet is needed only for the data refresh and OSM map tiles in the 2D view.

## AI-tool disclosure
This prototype was written with an AI coding assistant (Claude). Every team member must read and be able to explain the code they submit (viva).
Suggested ownership split is in the project pack (`08_Team_Roles_and_Workflow.md`).

Map data © OpenStreetMap contributors (ODbL). Terrain: Copernicus DEM GLO-90 via Open-Meteo.
