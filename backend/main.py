"""PRITHVI AI API  -  run:  uvicorn main:app --reload   (from backend/)"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS, VERSION
from api import routes


def create_app() -> FastAPI:
    app = FastAPI(title="PRITHVI AI API", version=VERSION,
                  description="Experimental neighbourhood risk digital-twin API. Outputs are indicative scenario indices, not forecasts.")
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
    app.include_router(routes.router)
    return app


app = create_app()
