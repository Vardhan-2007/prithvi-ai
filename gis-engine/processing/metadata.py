"""Provenance metadata attached to every output layer."""
from __future__ import annotations

import json
import math
import sys
import time
import hashlib
from datetime import datetime, timezone

import numpy as np

from gis_config import *  # noqa: F401,F403  (constants + projection helpers)


def layer_metadata(osm, dem_samples, counts):
    osm_ts = osm.get("osm3s", {}).get("timestamp_osm_base", "unknown")
    osm_common = dict(source_name="OpenStreetMap contributors (via Overpass API)",
                      source_url="https://www.openstreetmap.org/",
                      retrieved_at=osm_ts, licence_or_terms="ODbL 1.0 - (c) OpenStreetMap contributors",
                      data_status="observed")
    return [
        dict(id="dem", title="Terrain elevation", source_name="Copernicus GLO-90 DEM (via Open-Meteo elevation API)",
             source_url="https://dataspace.copernicus.eu/", retrieved_at=dem_samples["retrieved_at"],
             licence_or_terms="Copernicus DEM licence (free, attribution required)",
             native_resolution_or_scale="~90 m posting; integer-metre vertical values",
             processing_method="21x21 samples, 3x3 smoothing x2, bilinear upsample to 12.5 m grid, then priority-flood depression filling toward the lowest (downstream) edge so surface water can route; terrain index uses the unfilled surface. GLO-90 is a surface model (includes buildings/trees).",
             data_status="derived",
             known_limitations="Coarse, noisy in built-up areas; cannot resolve kerbs, culverts or underpasses. Sub-metre relief is not reliable."),
        dict(id="buildings", title=f"Buildings ({counts['buildings']})", **osm_common,
             native_resolution_or_scale="vector footprints, completeness varies",
             processing_method="Footprints clipped to the pilot extent; heights from OSM tags where present, otherwise a proxy of 2-4 storeys (visualisation only).",
             known_limitations="OSM completeness varies - the area is likely under-mapped. Default heights are a proxy."),
        dict(id="roads", title=f"Road network ({counts['roads']} segments)", **osm_common,
             native_resolution_or_scale="vector centrelines",
             processing_method="Highway ways clipped to extent; widths assigned by class; rasterised to the 12.5 m grid and lowered 0.15 m in the solver (assumed kerb-channel effect).",
             known_limitations="Width, kerb height and drainage by class are assumptions."),
        dict(id="facilities", title=f"Critical facilities ({counts['facilities']})", **osm_common,
             native_resolution_or_scale="points", processing_method="Amenity nodes/ways; building polygons reduced to centroids; near-duplicates merged.",
             known_limitations="Mapped facilities only; capacity, status and shelter suitability unknown. Not a verified emergency inventory."),
        dict(id="water", title=f"Water bodies ({counts['water']})", **osm_common,
             native_resolution_or_scale="vector polygons", processing_method="natural=water polygons clipped to extent; display only.",
             known_limitations="Display only; not coupled into the solver."),
        dict(id="drainage", title=f"Storm-drain inlets ({counts['inlets']}, proxy)", source_name="Team assumption (proxy)",
             source_url="", retrieved_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
             licence_or_terms="n/a", native_resolution_or_scale="points",
             processing_method="Farthest-point sampling along drivable roads (even spread, no terrain bias); each inlet carries an assumed capacity in the solver.",
             data_status="proxy",
             known_limitations="No surveyed drainage inventory was available. Locations, capacity and blockage are scenario assumptions, not an inspection record. Do not use to infer where real drains are."),
        dict(id="rainfall", title="Rainfall input", source_name="User-defined scenario (not a forecast)",
             source_url="https://gpm.nasa.gov/data/imerg", retrieved_at="", licence_or_terms="n/a",
             native_resolution_or_scale="uniform over the pilot area (IMERG native: ~0.1 deg / 30 min, too coarse for street level)",
             processing_method="Total depth over a chosen duration, distributed with a triangular-peaked hyetograph.",
             data_status="simulated",
             known_limitations="Spatially uniform; no antecedent moisture; no real event calibration."),
        dict(id="risk_zones", title="Analysis zones (100 m)", source_name="PRITHVI AI derived index",
             source_url="", retrieved_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
             licence_or_terms="derived from layers above", native_resolution_or_scale="100 m zones",
             processing_method="Terrain, drainage vulnerability and exposure normalised to 0-1 and combined with provisional weights 0.30/0.25/0.25/0.20.",
             data_status="derived",
             known_limitations="Indicative relative index. Not a probability, not calibrated, not a depth estimate."),
    ]
