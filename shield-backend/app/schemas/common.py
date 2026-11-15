from enum import Enum

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProtectionStrength(str, Enum):
    low = "low"            # prioritise visual similarity
    balanced = "balanced"  # trade-off (default)
    high = "high"          # prioritise adversarial objective within perceptual limits


class EngineName(str, Enum):
    face_shield = "face_shield"
    style_shield = "style_shield"


class ErrorResponse(StrictModel):
    error: str
    message: str
