# API contract

The machine-readable contract is [`docs/contracts/openapi.json`](contracts/openapi.json) (generated from the FastAPI app) plus JSON Schemas for the scenario request, zone explanation and layer metadata. Interactive docs: run the API and open http://127.0.0.1:8000/docs.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | service health |
| GET | `/api/v1/areas` · `/areas/{id}/layers` · `/baseline` · `/facilities` | pilot area, layer provenance, baseline map, mapped facilities |
| POST | `/api/v1/scenarios` | create + compute a scenario (`simulate: true` also runs the NumPy reference solver) |
| GET | `/api/v1/scenarios/{id}` · `/geojson` · `/compare` | stored scenario, zone GeoJSON, baseline-vs-scenario comparison |
| GET | `/api/v1/zones/{zone_id}/explanation` | factor breakdown + sentences |
| GET | `/api/v1/areas/{id}/forecast?hours=24\|48\|72` | Live mode: next N h of hourly rain from the Open-Meteo ECMWF ensemble as low / likely / high storms (cached 1 h; 503 if the service is unreachable) |
| GET | `/api/v1/areas/{id}/replay?date=YYYY-MM-DD` | Storm replay: hourly rain for one past local day, as the day-ahead forecast (from 2024) and as reanalysis (about 5 days behind); notes explain any missing series |
| POST | `/api/v1/assistant/query` | cited, extractive answer or an explicit abstain |

### Rainfall input: total or hyetograph

`rainfall_scenario` takes one of two shapes:

```json
{ "kind": "user_defined", "value": 100, "unit": "mm", "duration_hours": 6 }
{ "kind": "hyetograph", "hyetograph_mm": [0, 5, 20, 40, 10, 0], "step_hours": 1 }
```

A `user_defined` storm is simulated as a symmetric triangle. A `hyetograph` is rain depth per step (1–168 steps, each 0–300 mm, steps of 0.25–6 h); `value` and `duration_hours` are derived from it, and sending them with a hyetograph is rejected. The risk index uses the total and duration; `simulate: true` uses the full shape (storms up to 12 h).

Rules enforced by tests (`backend/tests/test_api.py`): numeric inputs validated, every response carries `data_status` and assumptions, the risk index is always called an index (0–100), never a probability or depth.
Regenerate the OpenAPI file after changing routes:
`cd backend && python3 -c "import json; from main import app; json.dump(app.openapi(), open('../docs/contracts/openapi.json','w'), indent=1)"`
