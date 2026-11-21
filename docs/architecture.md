# Architecture

```
                 ┌────────────────────────── apps/web (React + TS + Three.js + MapLibre) ──────────────────────────┐
 pipelines/ ───► │ features/twin3d  (Three.js scene + Web Worker flood solver)    features/map (MapLibre / compare)  │
 data/processed  │ features/scenarios  timeline  risk-panel  assistant  provenance   shared/engine (risk, routing)   │
                 └───────────────┬───────────────────────────────────────────────────────────────┬──────────────────┘
                                 │ optional (assistant, API-verified scenarios, exports)         │ fallback: local engine
                                 ▼                                                               ▼
                       apps/api (FastAPI)                                              same formulas in TypeScript
                 ┌──────┬────────────┬────────────┐
                 ▼      ▼            ▼            ▼
          engines/risk  engines/hydro  engines/rag  engines/gis (pipeline helpers)
```

* **Data flow.** `pipelines/build_pilot_dataset.py` downloads OSM (Overpass) and DEM samples (Copernicus GLO-90 via Open-Meteo), rasterises buildings/roads, conditions the DEM, places proxy inlets, derives per-zone indicators and writes one `data/processed/pilot_kakinada_01.json` (copied to `apps/web/public/data/`). Raw downloads are cached in `data/raw/`.
* **Why the engines exist twice.** The browser needs instant slider response and a real-time solver, so the risk index and flood solver are TypeScript. The Python versions are the API's engines *and* an independent check: `engines/risk/tests/test_parity.py` compares them on fixed scenarios.
* **Database.** The pack proposes PostgreSQL + PostGIS. For Level 1 the pilot is small and static, so the "precomputed GeoJSON fallback" from the pack is used; the API reads `data/processed`. `infra/db/migrations/001_init.sql` holds the PostGIS schema for the next step.
* **Contracts.** `contracts/openapi.yaml` + JSON schemas; `apps/api/tests/test_api.py` exercises them.
