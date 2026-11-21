.PHONY: data web api test dev
data:            ## fetch OSM + DEM (cached in data/raw) and rebuild data/processed + web copy
	python3 pipelines/build_pilot_dataset.py
	PYTHONPATH=engines/rag python3 -m prithvi_rag.ingest.build
web:             ## 3D twin on http://127.0.0.1:5173
	cd apps/web && npm install && npm run dev
api:             ## FastAPI on http://127.0.0.1:8000  (docs at /docs)
	cd apps/api && python3 -m uvicorn app.main:app --reload --port 8000
test:
	python3 -m pytest -q
	cd apps/web && npm test && npm run typecheck
