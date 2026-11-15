"""Request options for Video Shield. Unknown fields are rejected; only implemented options exist."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.protect import Strength


class VideoProtectOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strength: Strength = Strength.balanced
    output_profile: Literal["compatible", "lossless"] = "compatible"
    temporal_mode: Literal["flow", "static"] = "static"
    seed: int = Field(default=0, ge=0, le=2**31 - 1)
    max_steps: int | None = Field(default=None, ge=1, le=1000,
                                  description="Optional optimisation-step override, applied per keyframe.")
