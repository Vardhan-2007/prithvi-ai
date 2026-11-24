.PHONY: data web api test validation upgrade-check upgrade-apply derived
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
validation:      ## copy the observed-waterlogging reports into the web app after editing data/validation/
	cp data/validation/observed_waterlogging.json frontend/public/data/observed_waterlogging.json

upgrade-check:   ## build a candidate dataset (30 m terrain + OSM drains) and compare it with the replay check; changes nothing
	python3 gis-engine/processing/upgrade_pilot.py --dem glo30 --drains

upgrade-apply:   ## same, and keep the candidate; then rebuild everything derived from the dataset
	python3 gis-engine/processing/upgrade_pilot.py --dem glo30 --drains --apply --no-replay
	$(MAKE) derived

derived:         ## rebuild files derived from the dataset or the engines: baseline water + parity references
	cd frontend && npx vite-node scripts/export-baseline-water.ts && npx vite-node scripts/export-reference.ts && npx vite-node scripts/export-solver-reference.ts
