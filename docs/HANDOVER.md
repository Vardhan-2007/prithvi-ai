# Handover — where the project stands

Written 2026-11-23 for whoever continues development (human or Claude Code). Read `CLAUDE.md` at the repo root first; this file is the detail.

## 1. Status snapshot

| | |
|---|---|
| Repo | https://github.com/Vardhan-2007/prithvi-ai · branch `main` |
| Last pushed commit | `312b90c` "Simulation: symmetric storm peak and post-rain water recession" |
| Live site | https://prithvi-ai-psi.vercel.app (Vercel, static) |
| Live API | https://prithvi-ai-api.onrender.com (Render, Docker, free tier; docs at `/docs`) |
| Tests | 32 Python + 9 web, all passing; typecheck clean (verified 2026-11-23) |
| Licence | none chosen yet (the owner said "no licence yet") |

### Uncommitted work in the owner's working tree (review with `git status` / `git diff`)
These were done after the last push and are **not on GitHub yet**. Suggested split into commits:

1. **Drains tab + drain-likelihood engine** — `frontend/src/scenarios/engine/drains.ts` (+ `drains.test.ts`), `frontend/src/dashboard/risk/DrainsTab.tsx`, edits to `RightPanel.tsx`, `store.ts`, `TwinScene.ts`, `Twin3D.tsx`, `MapView.tsx`, `strings.ts`, `app.css`.
2. **Timeline: status sentence replaces the eight number boxes** — `frontend/src/dashboard/timeline/Timeline.tsx`, `strings.ts`, `app.css`.
3. **Docs/corpus** — `README.md`, `CHANGELOG.md`, `docs/methodology.md`, `docs/prototype-guide.md`, `ai-engine/rag/corpus/02_drainage_blockage_meaning.md`, rebuilt `data/processed/corpus.json` and `frontend/public/data/corpus.json`.
4. **Film script/measurements** — `video/script.mjs`, `video/measures.json` (see section 6).

## 2. What the project is
A real-time 3D flood-scenario twin of central Kakinada. The user picks rainfall, duration, drain blockage and pumps; the app simulates water moving through real streets, scores every 100 m zone (0–100), ranks inspection priority, checks hospital→shelter routes, explains every score, and has a cited retrieval assistant (English / Telugu UI). Honest by design: scenario, not forecast.

## 3. Deployments and access
- **Frontend:** Vercel project `prithvi-ai`, root directory `frontend`. Env var `VITE_API_URL=https://prithvi-ai-api.onrender.com` (baked in at build; changing it needs a redeploy).
- **Backend:** Render web service `prithvi-ai-api`, built from the repo-root `Dockerfile` (blueprint: `render.yaml`). Env var `PRITHVI_CORS_ORIGINS=https://prithvi-ai-psi.vercel.app` (exact origin, no trailing slash, comma-separate extras).
- Pushing to `main` redeploys both automatically. Free Render sleeps when idle (first request up to ~1 min; the site falls back to its in-browser engine meanwhile).
- **Access:** the Vercel and Render projects belong to the owner's accounts. The new developer needs to be invited to GitHub (collaborator), Vercel and Render. No secrets are stored in the repo.
- Full guide: `docs/deployment.md`.

## 4. Run it
Needs Node 20+ and Python 3.12+ (3.10+ works).
```bash
make web      # http://127.0.0.1:5173
make api      # http://127.0.0.1:8000 (optional; header shows "API online" when reachable)
make test     # all tests + typecheck
```
The repo-root `.env.example` lists the variables. The app works with no backend and no database by design: the dataset is a static JSON file (`frontend/public/data/pilot_kakinada_01.json`, ~370 KB, built offline by `gis-engine/`), nothing is stored per user, and backend scenarios are held in memory.

## 5. Architecture in one page
- **Frontend (the product):** `store.ts` (Zustand) holds scenario, layers, selected zone/drain, playback. Moving a slider re-scores instantly (`scenarios/engine/risk.ts`); 450 ms later the flood solver restarts in a Web Worker (`maps/twin3d/sim/floodSolver.ts`, snapshots every 120 s). Views: 3D (`maps/twin3d/scene/TwinScene.ts`, Three.js), 2D (`maps/map2d/MapView.tsx`, MapLibre), Compare. Right panel tabs: Overview · Zone · Priority · Drains · Routes · Assistant · Data & limits.
- **Backend (optional):** `backend/` FastAPI, 11 routes, Python risk engine (`ai-engine/risk_scoring`), NumPy solver (`backend/simulation/virtual_pipe.py`), BM25 assistant (`ai-engine/rag`). `simulate:true` is single-flight (429 when busy).
- **Data pipeline:** `gis-engine/` (OSM Overpass + Copernicus GLO-90 → priority-flood DEM → masks → 56 proxy inlets → 272 zones → `data/processed/*.json` + provenance in `layers.yaml`).
- Every formula and constant is documented in `docs/prototype-guide.md` (sections 7–8) and `docs/methodology.md`.

### Key assumptions (all marked "assumed" in the UI/docs)
Risk weights 0.30/0.25/0.25/0.20; bands 35/48/60; storm = symmetric triangle peaking at 50 % of the duration; runoff 0.9 (paved) / 0.55 (other); road cells −0.15 m; inlet capacity 0.25 m³/s, pump 0.15 m³/s; outfall crest 0.30 m; **post-rain recession τ = 1 h**; drain-likelihood weights 0.40 low-lying / 0.30 built-up / 0.30 spacing.

## 6. Unfinished work (in priority order)

### A. Commit and push the uncommitted work (section 1). Ask the owner before pushing.

### B. Re-render the three films (stale)
The films in `docs/demo/` (git-ignored, local to the owner's Mac) were rendered with the old storm (peak at 40 %, water never receding). They quote old numbers (e.g. "the rain peaks at one thirty six", "ten hectares at one o'clock"). A re-render was started and **paused**:
- Done: `video/script.mjs` narration and Telugu lines updated for the new timeline; `video/measures.json` re-measured (6.1 ha at 1:00, 22.6 ha at 2:00, widest 24.0 ha at ~2:14, 11.5 ha when the rain stops, almost dry by 7:00; route claims unchanged: 25 cm connected, 10 cm cut, ~14 km of road).
- Not done: Telugu and most English narration synthesis, all frame recording, assembly. Cached audio and `tts_venv`/`models` are local to the owner's machine and **not in git**.
- To resume on a new machine: `cd video && bash setup.sh` (npm packages, ffmpeg, Chrome for Testing). The Telugu voice (Piper `te_IN-padmavathi-medium`) is **not** set up by `setup.sh`: create `video/tts_venv` with `piper-tts` + `numpy` and put the model files in `video/models/` (see `tts_te.py`; verify the model source). Run the app (`make web`), then:
  ```bash
  cd video
  DTYPE=fp32 SPEED=0.92 node tts.mjs story && DTYPE=fp32 SPEED=0.92 node tts.mjs cine
  node export_te.mjs && tts_venv/bin/python tts_te.py
  REST_EVERY=700 REST_MS=6000 FPS_MOTION=12 node record.mjs story film && node assemble.mjs story ../docs/demo/prithvi-ai-cinematic-story.mp4
  # same pattern: `cine` -> prithvi-ai-cinematic-film.mp4, `te` -> prithvi-ai-cinematic-story-telugu.mp4
  ```
  `make_te.sh` waits on a log file that no longer exists; run the steps by hand, one at a time. Use `taskpolicy -b` on macOS: the owner's Mac overheated and rebooted once during recording. Allow hours. Review the Telugu narration with a native speaker.
- Film rules from the owner: cinematic storytelling only (no UI explaining the prototype), clear voice, rain/music kept ~20 dB under the voice, "fictional" tag on screen.

### C. PDF study guide is partly stale
`docs/PRITHVI-AI-study-guide.pdf` still describes the eight number boxes, six tabs, 32+5 tests and has no Drains tab. Its generator script was lost (it lived in a temporary folder). Rebuild it (reportlab with DejaVu fonts worked well) or regenerate from `docs/prototype-guide.md`.

### D. Drains feature follow-ups
It is frontend-only (no Python mirror, no API route) and is an **indicative ranking, not a prediction** (no real drain or blockage data exists). Ideas: precompute a flooded-area-based criticality (56 solver runs) instead of the risk-index-based one; add a Python mirror + API route if the backend should expose it; replace proxy inlets with the municipal inventory when available.

### E. Known issues and small things
- A screenshot once showed 4 depth pins although the code caps them at 3 (`updateHotspots` in `TwinScene.ts`); likely a stale label from the twice-a-second refresh. Cosmetic, unconfirmed.
- Telugu strings are a first draft; needs native-speaker review.
- No licence chosen. Render free-tier cold starts. Scenarios in the API are lost on restart. API has no auth.

## 7. Roadmap (what would make it credible)
1. Validate against a documented historical event (compare simulated vs observed flooded extent; report IoU/precision/recall).
2. Real drain inventory, inspection and complaint history → a data-driven blockage model.
3. Better terrain (LiDAR/drone), calibrated runoff and weights.
4. Storm-shape selector (symmetric / front-loaded / back-loaded / uniform, all integrating to the chosen total) and a real hyetograph for Kakinada. Offered to the owner, not decided.
5. More wards, a PostGIS database and persistent API (`backend/models/schema.sql` is a sketch), live gauges.
6. A language model on top of retrieval, keeping citations and the abstain rule.

## 8. Gotchas
- Editing `ai-engine/rag/corpus/*.md` requires `PYTHONPATH=ai-engine python3 -m rag.ingest.build` (writes both `corpus.json` copies).
- Solver/risk changes must be made in both languages; the parity and mass-balance tests will catch drift.
- The simulation takes a few seconds in the browser; tests run the full solver (~30 s for the web suite).
- `docs/demo/*.mp4|*.srt` and the heavy `video/` folders are git-ignored on purpose (GitHub rejects files over 100 MB). Host films as a GitHub Release or on a video site and link them from the README.
- zsh does not split unquoted variables; quote or write commands out.
- Commit messages: no `Co-Authored-By` trailer (the owner's request).

## 9. Starting a Claude Code session on this repo
Open the cloned folder in Claude Code; `CLAUDE.md` loads automatically. Suggested first message: *"Read CLAUDE.md and docs/HANDOVER.md, run `make test`, then tell me the state and what you would do first."* The previous conversation does not transfer between machines; these two files are the handover.
