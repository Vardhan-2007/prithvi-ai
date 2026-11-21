# Architecture

```
                  ┌──────────────────────────── frontend  (React + TS + Three.js + MapLibre) ────────────────────────────┐
 gis-engine ────► │ maps/twin3d  (Three.js scene + Web Worker flood solver)       maps/map2d  (MapLibre, compare view)      │
 data/processed   │ scenarios    (controls + risk/routing engine in TS)            dashboard   (risk panels, timeline,       │
                  │ components   (header, nav pad/compass, i18n, api client)                    assistant, provenance)       │
                  └───────────────┬───────────────────────────────────────────────────────────────┬────────────────────────┘
                                  │ optional (assistant, API-verified scenarios, exports)         │ fallback: local engine
                                  ▼                                                               ▼
                          backend (FastAPI)                                               same formulas in TypeScript
                   api/  models/  services/  simulation/
                                  │
                         ┌────────┴─────────┐
                         ▼                  ▼
                    ai-engine/          gis-engine/
              risk_scoring · rag      terrain · processing · risk_analysis
```

* **Data flow.** `gis-engine/processing/build_pilot_dataset.py` downloads OSM (Overpass) and DEM samples (Copernicus GLO-90 via Open-Meteo), rasterises buildings/roads (`processing/osm.py`), conditions the DEM (`terrain/dem.py`), places proxy inlets, derives per-zone indicators (`risk_analysis/zones.py`) and writes `data/processed/pilot_kakinada_01.json` (copied to `frontend/public/data/`). Raw downloads are cached in `data/raw/` (git-ignored).
* **Why the engines exist twice.** The browser needs instant slider response and a real-time solver, so the risk index and flood solver are TypeScript. The Python versions (`ai-engine/risk_scoring`, `backend/simulation`) are the API's engines *and* an independent check: `ai-engine/risk_scoring/tests/test_parity.py` compares them on fixed scenarios.
* **Database.** The pack proposes PostgreSQL + PostGIS. For Level 1 the pilot is small and static, so the "precomputed GeoJSON fallback" from the pack is used; the API reads `data/processed`. `backend/models/schema.sql` holds the PostGIS schema for the next step.
* **Contracts.** `docs/contracts/openapi.json` + JSON schemas; `backend/tests/test_api.py` exercises them.
