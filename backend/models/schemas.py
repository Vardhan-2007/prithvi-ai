from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

MAX_HYETOGRAPH_STEPS = 168
MAX_STEP_MM = 300.0


class RainfallScenario(BaseModel):
    """Either a total depth + duration (kind=user_defined, triangular storm) or an hour-by-hour
    hyetograph (kind=hyetograph, e.g. a forecast or a replayed storm). For a hyetograph, value and
    duration_hours are derived from it and must not be sent."""
    kind: Literal["user_defined", "hyetograph"] = "user_defined"
    value: float | None = Field(default=None, ge=0, le=1000, description="total depth (mm); derived for a hyetograph")
    unit: Literal["mm"] = "mm"
    duration_hours: float | None = Field(default=None, ge=0.25, le=168)
    hyetograph_mm: list[float] | None = Field(default=None, min_length=1, max_length=MAX_HYETOGRAPH_STEPS,
                                              description="rain depth per step (mm), steps of step_hours")
    step_hours: float = Field(default=1.0, ge=0.25, le=6)

    @model_validator(mode="after")
    def _check(self) -> "RainfallScenario":
        if self.kind == "hyetograph":
            if not self.hyetograph_mm:
                raise ValueError("kind=hyetograph needs hyetograph_mm")
            if any(not (0 <= v <= MAX_STEP_MM) for v in self.hyetograph_mm):
                raise ValueError(f"each hyetograph step must be 0..{MAX_STEP_MM:g} mm")
            self.value = float(sum(self.hyetograph_mm))
            self.duration_hours = len(self.hyetograph_mm) * self.step_hours
            if self.value > 1000 or self.duration_hours > 168:
                raise ValueError("hyetograph total must be <= 1000 mm and <= 168 h")
        else:
            if self.hyetograph_mm is not None:
                raise ValueError("hyetograph_mm is only allowed with kind=hyetograph")
            if self.value is None or self.duration_hours is None:
                raise ValueError("kind=user_defined needs value and duration_hours")
            if not (1 <= self.value <= 600) or not (0.25 <= self.duration_hours <= 72):
                raise ValueError("user_defined rainfall must be 1..600 mm over 0.25..72 h")
        return self


class ScenarioRequest(BaseModel):
    area_id: str = "pilot_kakinada_01"
    name: str = Field(default="", max_length=120)
    rainfall_scenario: RainfallScenario
    drainage_blockage_fraction: float = Field(default=0.0, ge=0, le=1)
    overrides: dict[str, Literal["blocked", "cleared"]] = Field(default_factory=dict, max_length=200)
    pumps: bool = False
    simulate: bool = Field(default=False, description="also run the reference flood solver (slow, <= 12 h)")


class AssistantRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    live_context: str | None = Field(default=None, max_length=700)
