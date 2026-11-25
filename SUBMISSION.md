# HackWithAditya 2026: Level 1 submission sheet

Every field of the Level 1 form, ready to copy. Fill in the `[TEAM: ...]` lines yourselves.

## Team

- Team name: `[TEAM: name]`
- Members: `[TEAM: names, roll numbers, emails, phones, who leads]`

## Project title

**PRITHVI AI: a neighbourhood flood and drainage digital twin for Kakinada**

## Problem statement

Kakinada waterlogs in almost every heavy rain: in the past year Cyclone Murasu (2–3 Nov), Cyclone Arnab (28 Oct) and
monsoon downpours (28 Jun, 24 Sep) left Main Road, Temple Street and many colonies under water (news reports
are listed in `data/validation/observed_waterlogging.json`). Municipal staff decide *before* each storm which drains
to clear, where to put pumps and which streets to check, with no tool that joins the rain forecast, the terrain,
the drains and the tide into one picture at street level. City-scale flood models exist, but they need data and
experts that a municipal ward office does not have.

## Target users

1. Municipal engineers and sanitation supervisors (Kakinada Municipal Corporation): drain clearing and pump placement before a storm.
2. Ward officers and disaster-management staff: where to send people first, with a printable brief in Telugu or English.
3. Planners and students: what-if questions ("what if a third of the drains are blocked and the tide is high?").

## Abstract (about 150 words)

PRITHVI AI is a browser-based digital twin of 2.7 km² of central Kakinada. It is built from OpenStreetMap
buildings, roads and facilities, Copernicus terrain and 56 drain points. Users set or forecast a storm (live
51-member ECMWF ensemble rain), drain blockage, ground wetness and tide or surge level. A shallow-water flood
solver then shows water spreading hour by hour in 3D. A transparent risk index ranks 272 zones. After the run it
switches to the simulated water. Officers get a ranked inspection list in which each zone is "sure" or "maybe"
across forecast uncertainty, a printable English/Telugu brief (which drains to clear, where pumps help), a
cheapest-first "what money buys" plan, safe routes, and a cited assistant that refuses to guess. Uniquely, it checks
itself. A Replay mode re-runs past storm days with the rain that actually fell and scores the result against news
and field reports. It reports honestly where it misses.

## Working prototype

- Live app: https://prithvi-ai-psi.vercel.app (API: https://prithvi-ai-api.onrender.com, which sleeps when idle; the first call can take about 50 s)
- Repository: https://github.com/Vardhan-2007/prithvi-ai

### Features

| Area | What works today |
|---|---|
| Digital twin | 3D and 2D views of 1.6 × 1.7 km of Kakinada: 12.5 m grid, buildings, roads, facilities, 56 drain points; every layer has source, licence and limits in *Data & limits* |
| Flood simulation | Shallow-water ("virtual pipe") solver in the browser (and the same solver in Python, checked for parity by tests); rain, drains, blocked drains, pumps, wet ground, tide/surge |
| Live mode | Real ECMWF 51-member ensemble rain forecast (24–72 h) as low / likely / high cases, plus today's soil moisture and tide from Open-Meteo |
| Risk and priority | 272 zones scored on terrain, rain, drainage, exposure, then on the simulated water; ranked inspection list with street names |
| Sure / maybe | Each flagged zone tested against a low and a high case: "sure" zones stay flagged even with less rain and fewer blocked drains |
| Officer brief | One-page printable brief in English or Telugu, or copied as text for WhatsApp |
| What money buys | Cheapest-first plan of drain clearing and pumps, with editable costs, as a chart; one click applies it |
| Routes | Safest road route between facilities in dry and flooded conditions |
| Replay and validation | Any past day since 2024 replayed with the forecast issued the day before or the rain that fell, scored against 19 news reports and field reports |
| Field reports | Log waterlogging seen on the ground; counted in the Replay check; exported for review |
| Assistant | Answers from the project's own documents with citations, in the browser or through the API; refuses off-topic and personal-safety questions |
| Usability | English / Telugu, 1-minute guided demo, shareable scenario links, works on phones |
| Quality | 123 Python + 126 browser tests, two solvers and two risk engines kept in step by parity tests, typed API with validation |

### Limitations (stated in the app as well)

1. The risk index is a relative score, not a flood probability or a depth. The flood model is **not calibrated**.
2. **Validation result: 0 hits so far.** Replaying the three reported storm days, the flagged zones are 558–1,540 m from the reported streets. The main suspected cause is the ~90 m terrain; a 30 m upgrade with a before/after check is built (`make upgrade-check`) and is the first enhancement for the event.
3. The drain points are proxies (no drainage inventory exists in open data). Blockage is a what-if setting.
4. The forecast rain is uniform over the pilot (one ~25 km model cell). Thunderstorm bursts are smoothed.
5. The wet-ground and tide effects, the sure/maybe brackets and the costs are assumptions, documented in `docs/methodology.md`.
6. The Telugu text is a first draft. Not an alert or evacuation tool.

## Setup steps

```bash
git clone https://github.com/Vardhan-2007/prithvi-ai
cd prithvi-ai/frontend
npm install
npm run dev
```
Open http://127.0.0.1:5173. Optional API and tests (Python 3.10+):
```bash
cd prithvi-ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
make api
make test
```

## Tech stack, hardware, dependencies

- **Frontend:** React 18, TypeScript, Vite, Three.js (3D), MapLibre GL (2D), Zustand; Vitest for tests.
- **Backend:** Python, FastAPI, Pydantic, NumPy, Uvicorn; pytest.
- **Data pipeline (`gis-engine`):** Python + NumPy; OpenStreetMap (Overpass), Copernicus GLO-90 / GLO-30 terrain, Open-Meteo (ensemble forecast, previous-runs archive, ERA5 reanalysis, marine tide, soil moisture).
- **Hosting:** Vercel (web), Render (API, Docker).
- **Hardware:** any laptop with a WebGL browser; no GPU, sensors or paid services.
- **AI tools:** see `AI_DISCLOSURE.md`.

## Demo video (under 5 minutes)

Script: `docs/demo-script.md` (4:30). Record the screen at 1080p with voice-over; upload it unlisted and paste the link here: `[TEAM: video link]`.
