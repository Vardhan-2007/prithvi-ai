import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("PRITHVI_DATA_DIR", REPO / "data" / "processed"))
CORS_ORIGINS = [o.strip() for o in os.environ.get(
    "PRITHVI_CORS_ORIGINS",
    "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173").split(",") if o.strip()]
AREA_ID = "pilot_kakinada_01"
VERSION = "0.1.0"

# make the in-repo ai-engine packages importable without installing them
for sub in ("ai-engine",):  # risk_scoring + rag packages
    p = str(REPO / sub)
    if p not in sys.path:
        sys.path.insert(0, p)
