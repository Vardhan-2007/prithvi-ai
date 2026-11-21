from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class RainfallScenario(BaseModel):
    kind: Literal["user_defined"] = "user_defined"
    value: float = Field(ge=1, le=600, description="total depth")
    unit: Literal["mm"] = "mm"
    duration_hours: float = Field(ge=0.25, le=72)


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
