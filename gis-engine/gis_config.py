"""Shared constants for the GIS pipeline: pilot area, grid, local projection, paths."""
from __future__ import annotations

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_PUBLIC = ROOT / "frontend" / "public" / "data"

AREA_ID = "pilot_kakinada_01"
AREA_NAME = "Kakinada town core (pilot 01)"
# Requested bounding box (south, west, north, east). Grid is anchored at the SW corner.
S, W, N, E = 16.9440, 82.2320, 16.9590, 82.2470
CELL = 12.5            # simulation cell size in metres
ZONE_CELLS = 8         # 8 x 8 cells = 100 m analysis zones
USER_AGENT = "prithvi-ai-hackathon-prototype/0.1 (educational)"

LAT0 = (S + N) / 2
M_PER_DEG_LAT = 110540.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))

NX = int(round((E - W) * M_PER_DEG_LON / CELL))
NY = int(round((N - S) * M_PER_DEG_LAT / CELL))
WIDTH_M, HEIGHT_M = NX * CELL, NY * CELL
EAST = W + WIDTH_M / M_PER_DEG_LON
NORTH = S + HEIGHT_M / M_PER_DEG_LAT

ROAD_WIDTH = {"primary": 12, "secondary": 10, "tertiary": 8, "unclassified": 5.5,
              "residential": 5.5, "service": 4, "living_street": 4}
FACILITY_CATEGORY = {
    "hospital": "health", "clinic": "health", "doctors": "health", "pharmacy": "health",
    "fire_station": "emergency", "police": "emergency",
    "school": "shelter", "community_centre": "shelter", "townhall": "shelter",
    "place_of_worship": "shelter",
}




def to_xy(lon: float, lat: float) -> tuple[float, float]:
    return (lon - W) * M_PER_DEG_LON, (lat - S) * M_PER_DEG_LAT


def to_lonlat(x: float, y: float) -> tuple[float, float]:
    return W + x / M_PER_DEG_LON, S + y / M_PER_DEG_LAT


def http(url: str, data: bytes | None = None, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()
