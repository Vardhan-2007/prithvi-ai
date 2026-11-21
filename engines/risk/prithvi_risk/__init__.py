"""Explainable neighbourhood risk index (Python twin of apps/web/src/shared/engine/risk.ts)."""
from .index.engine import (  # noqa: F401
    BASELINE, BAND_THRESHOLDS, WEIGHTS, band_of, evaluate, inlet_order, rainfall_factor, resolve_inlet_open,
)
