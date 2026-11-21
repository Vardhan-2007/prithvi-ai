# Contributing to PRITHVI AI

Thanks for helping! This is a hackathon-born prototype that we want to keep **honest, readable and testable**.

## Ground rules
1. **Never present assumed or simulated values as measured.** Every layer and number needs a source and a status: *observed · derived · proxy · simulated*.
2. **Do not claim accuracy we have not validated** (no "95 % accurate", no flood probabilities, no "safe route"). Outputs are indicative scenarios.
3. **Don't fabricate data.** If data is missing, show it as unavailable.
4. **Keep it understandable.** Every contributor must be able to explain the code they submit — including code written with an AI assistant (please say so in the PR).

## Set up
```bash
git clone <repo-url> && cd prithvi-ai
cd frontend && npm install && npm run dev       # 3D app on http://127.0.0.1:5173
cd ../backend && pip install -r requirements.txt && python3 -m uvicorn main:app --port 8000   # optional API
```

## Where things live
| You want to change… | Go to |
|---|---|
| 3D scene, water, camera | `frontend/src/maps/twin3d/` |
| 2D map / compare view | `frontend/src/maps/map2d/` |
| Scenario controls, risk engine (TypeScript) | `frontend/src/scenarios/` |
| Panels, timeline, assistant, provenance | `frontend/src/dashboard/` |
| API | `backend/api/`, `backend/services/`, `backend/models/` |
| Flood solver (Python reference) | `backend/simulation/` |
| Risk index (Python) / retrieval | `ai-engine/risk_scoring/`, `ai-engine/rag/` |
| Data download and processing | `gis-engine/` |

## Workflow
1. Fork or branch from `main` (`feature/short-name`, `fix/short-name`).
2. Make a focused change with tests where it makes sense.
3. Run **`make test`** (Python tests, web tests, typecheck). CI runs the same checks.
4. Open a pull request using the template; screenshots for UI changes.

## Things to remember
* **Two risk engines.** The index exists in TypeScript (`frontend/src/scenarios/engine/risk.ts`) and Python (`ai-engine/risk_scoring/engine.py`). If you change one, change the other, then run `cd frontend && npx vite-node scripts/export-reference.ts` and `python3 -m pytest`. The parity test must pass.
* **Flood solver.** `frontend/src/maps/twin3d/sim/floodSolver.ts` and `backend/simulation/virtual_pipe.py` implement the same equations. Keep constants identical; mass-conservation tests must stay green.
* **Regenerating data** (`make data`) re-downloads OpenStreetMap and elevation data. Respect their terms and rate limits; commit the regenerated `data/processed/` files.
* **Translations** live in `frontend/src/components/i18n/strings.ts`. Add English first; Telugu text needs review by a Telugu speaker.
* **Style:** TypeScript strict mode; Python with type hints; keep functions small and name things after the domain (zone, inlet, band).

## Reporting problems
Use the issue templates. For security concerns see [SECURITY.md](SECURITY.md).
