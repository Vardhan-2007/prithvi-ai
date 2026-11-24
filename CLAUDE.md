# PRITHVI AI — notes for Claude Code

Neighbourhood flood-risk **digital twin** (HackWithAditya 2026, Smart Infrastructure & Water). Pilot area: central Kakinada, 1.6 × 1.7 km.
It is an **experimental planning and visualisation prototype**: rainfall is a user scenario, scores are indicative indices, water depths are uncalibrated. It is **not** a forecast.

**Read first:** `docs/HANDOVER.md` (current state, unfinished work, gotchas) · `docs/prototype-guide.md` (every control, value and formula) · `docs/methodology.md` · `docs/limitations.md`.

## Commands
```bash
make web            # frontend dev server  http://127.0.0.1:5173   (cd frontend && npm install && npm run dev)
make api            # FastAPI backend      http://127.0.0.1:8000   (docs at /docs)
make test           # 32 Python tests + 9 web tests + typecheck  (CI runs the same)
make data           # rebuild the dataset from OSM + Copernicus (needs network)
PYTHONPATH=ai-engine python3 -m rag.ingest.build   # rebuild corpus.json after editing ai-engine/rag/corpus/*.md
```

## Layout
`frontend/` React 18 + TypeScript + Vite + Three.js + MapLibre + Zustand (the whole product runs in the browser) ·
`backend/` FastAPI + NumPy solver (optional API) · `ai-engine/` risk scoring (Python) + BM25 retrieval assistant ·
`gis-engine/` builds the dataset · `data/processed/` the built dataset · `docs/` documentation · `video/` film production tooling (not part of the product).

## Rules that matter
1. **Stay honest.** Keep the "Simulated · not a forecast" pill and the bottom banner. Label anything assumed as assumed. Never present proxy drains, uncalibrated depths or the drain-likelihood ranking as real or predictive.
2. **Keep the two implementations identical.** Risk engine: `frontend/src/scenarios/engine/risk.ts` ↔ `ai-engine/risk_scoring/engine.py` (parity test). Flood solver: `frontend/src/maps/twin3d/sim/floodSolver.ts` ↔ `backend/simulation/virtual_pipe.py`. Change both, with tests.
3. **Assistant is retrieval only** (BM25, cited, abstains). No generative model. Browser copy `localRetrieval.ts` must match `ai-engine/rag/`.
4. **Git:** no `Co-Authored-By` trailer in commits (the owner asked for this). Do not commit generated videos, `video/node_modules`, `video/browsers`, `video/tts_venv`, `video/models`, `video/frames`. Do not push without the owner's say-so.
5. `VITE_API_URL` is baked in at build time; `PRITHVI_CORS_ORIGINS` must match the site origin exactly (no trailing slash).
6. Before saying something works, run `make test` and look at it in the browser.
