.PHONY: data web api test
data:            ## fetch OSM + DEM (cached in data/raw) and rebuild data/processed + the frontend copy
	python3 gis-engine/processing/build_pilot_dataset.py
	PYTHONPATH=ai-engine python3 -m rag.ingest.build
web:             ## 3D twin on http://127.0.0.1:5173
	cd frontend && npm install && npm run dev
api:             ## FastAPI on http://127.0.0.1:8000  (docs at /docs)
	cd backend && python3 -m uvicorn main:app --reload --port 8000
test:
	python3 -m pytest -q
	cd frontend && npm test && npm run typecheck
