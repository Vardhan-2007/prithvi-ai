# API contract

The machine-readable contract is [`contracts/openapi.json`](../contracts/openapi.json) (generated from the FastAPI app) plus JSON Schemas for the scenario request, zone explanation and layer metadata. Interactive docs: run the API and open http://127.0.0.1:8000/docs.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | service health |
| GET | `/api/v1/areas` · `/areas/{id}/layers` · `/baseline` · `/facilities` | pilot area, layer provenance, baseline map, mapped facilities |
| POST | `/api/v1/scenarios` | create + compute a scenario (`simulate: true` also runs the NumPy reference solver) |
| GET | `/api/v1/scenarios/{id}` · `/geojson` · `/compare` | stored scenario, zone GeoJSON, baseline-vs-scenario comparison |
| GET | `/api/v1/zones/{zone_id}/explanation` | factor breakdown + sentences |
| POST | `/api/v1/assistant/query` | cited, extractive answer or an explicit abstain |

Rules enforced by tests (`apps/api/tests/test_api.py`): numeric inputs validated, every response carries `data_status` and assumptions, the risk index is always called an index (0–100), never a probability or depth.
Regenerate the OpenAPI file after changing routes:
`PYTHONPATH=apps/api:engines/risk:engines/hydro:engines/rag python3 -c "import json; from app.main import app; json.dump(app.openapi(), open('contracts/openapi.json','w'), indent=1)"`
