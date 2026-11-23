"""Rain input for the flood solver: the symmetric triangle (what-if presets) or a step hyetograph
(rain depth per fixed step, e.g. an hourly forecast or a replayed past storm). Rain inside a step falls at a
constant rate. Mirrors frontend/src/maps/twin3d/sim/storm.ts."""
from __future__ import annotations

import math
from dataclasses import dataclass, field

PEAK_FRACTION = 0.5
MAX_STEPS = 168
MAX_STEP_MM = 300.0


@dataclass(frozen=True)
class TriangleStorm:
    total_mm: float
    duration_h: float


@dataclass(frozen=True)
class StepStorm:
    mm: tuple[float, ...]
    step_h: float = 1.0
    start_iso: str | None = None
    label: str | None = None
    _cum: tuple[float, ...] = field(default=(), repr=False, compare=False)

    def __post_init__(self) -> None:
        if not self.step_h > 0:
            raise ValueError("step_h must be > 0")
        if not 1 <= len(self.mm) <= MAX_STEPS:
            raise ValueError(f"a hyetograph needs 1..{MAX_STEPS} steps")
        for v in self.mm:
            if not (math.isfinite(v) and 0 <= v <= MAX_STEP_MM):
                raise ValueError(f"each step must be 0..{MAX_STEP_MM:g} mm")
        cum, s = [], 0.0
        for v in self.mm:
            cum.append(s)
            s += v
        object.__setattr__(self, "_cum", tuple(cum))


Storm = TriangleStorm | StepStorm


def step_storm(mm, step_h: float = 1.0, start_iso: str | None = None, label: str | None = None) -> StepStorm:
    return StepStorm(tuple(float(v) for v in mm), float(step_h), start_iso, label)


def duration_h(s: Storm) -> float:
    return s.duration_h if isinstance(s, TriangleStorm) else len(s.mm) * s.step_h


def total_mm(s: Storm) -> float:
    return s.total_mm if isinstance(s, TriangleStorm) else float(sum(s.mm))


def peak_mm_h(s: Storm) -> float:
    if isinstance(s, TriangleStorm):
        return 2 * s.total_mm / s.duration_h
    return max(s.mm) / s.step_h


def rate_mm_h(s: Storm, t: float) -> float:
    if isinstance(s, TriangleStorm):
        D = s.duration_h * 3600.0
        tp = PEAK_FRACTION * D
        if t < 0 or t >= D:
            return 0.0
        peak = 2 * s.total_mm / s.duration_h
        return peak * (t / tp) if t < tp else peak * (1 - (t - tp) / (D - tp))
    if t < 0:
        return 0.0
    k = math.floor(t / (s.step_h * 3600.0))
    return s.mm[k] / s.step_h if k < len(s.mm) else 0.0


def cumulative_mm(s: Storm, t: float) -> float:
    if isinstance(s, TriangleStorm):
        D = s.duration_h * 3600.0
        tp = PEAK_FRACTION * D
        t = min(max(t, 0.0), D)
        peak = 2 * s.total_mm / s.duration_h / 3600.0
        if t <= tp:
            return 0.5 * peak * t * t / tp
        return 0.5 * peak * tp + peak * (t - tp) - 0.5 * peak * (t - tp) ** 2 / (D - tp)
    step_s = s.step_h * 3600.0
    t = max(0.0, t)
    k = math.floor(t / step_s)
    if k >= len(s.mm):
        return total_mm(s)
    return s._cum[k] + s.mm[k] * ((t - k * step_s) / step_s)
