"""PRITHVI AI API  -  run:  uvicorn app.main:app --reload   (from apps/api)"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import CORS_ORIGINS, VERSION
from .routers import api


def create_app() -> FastAPI:
    app = FastAPI(title="PRITHVI AI API", version=VERSION,
                  description="Experimental neighbourhood risk digital-twin API. Outputs are indicative scenario indices, not forecasts.")
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
    app.include_router(api.router)
    return app


app = create_app()
