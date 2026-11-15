"""Request and response schemas for protection jobs.

Only options that are implemented are accepted. Unknown fields are rejected.
Advanced optimiser parameters (epsilon, learning rate, alpha, p_s) are NOT exposed through the API;
they stay internal until they have been validated experimentally.
"""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Strength(str, Enum):
    low = "low"
    balanced = "balanced"
    high = "high"


class OutputFormat(str, Enum):
    png = "png"        # lossless, keeps transparency
    jpeg = "jpeg"      # lossy, NO transparency
    webp = "webp"      # lossy by default here, keeps transparency


class ProtectOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strength: Strength = Strength.balanced
    output_format: OutputFormat = OutputFormat.png
    quality: int = Field(default=92, ge=1, le=100, description="JPEG/WebP quality. Ignored for PNG and lossless WebP.")
    webp_lossless: bool = Field(default=False, description="Use lossless WebP (exact budget, larger file). Ignored for png/jpeg.")
    seed: int = Field(default=0, ge=0, le=2**31 - 1, description="Seed for target-style selection.")
    max_steps: int | None = Field(default=None, ge=1, le=1000,
                                  description="Optional override of the optimisation step count.")

    @field_validator("quality", mode="before")
    @classmethod
    def _int_only(cls, v):
        if isinstance(v, bool) or (isinstance(v, str) and not v.strip().lstrip("-").isdigit()):
            raise ValueError("must be an integer")
        return v


class JobCreated(BaseModel):
    job_id: str
    owner_token: str = Field(description="Shown once. Required (X-Job-Token header) for every later "
                                         "request about this job. Not recoverable.")
    state: str
    status_url: str
    record_url: str
    output_url: str


class ErrorBody(BaseModel):
    error: str
    message: str
