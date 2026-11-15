"""Runtime settings from SHIELD_* environment variables (and an optional .env file).

Safe development defaults. Production deployments MUST set SHIELD_AUTH_MODE=api_key and
SHIELD_PRODUCTION_MODE=true (see docs/SECURITY.md).
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SHIELD_", env_file=".env", extra="ignore")

    # --- compute ---
    device: Literal["auto", "cpu", "gpu"] = "auto"

    # --- input limits ---
    max_upload_mb: int = Field(default=15, ge=1, le=100)
    max_input_pixels: int = Field(default=512 * 512, ge=1024, le=4096 * 4096)
    min_side_px: int = Field(default=32, ge=16, le=512)

    image_input_policy: Literal["lossless_only", "any"] = Field(
        default="lossless_only",
        description="lossless_only: accept PNG and lossless WebP uploads only. any: also accept JPEG and "
                    "lossy WebP (legacy behaviour; output is still budget-verified).")

    # --- jobs ---
    max_concurrent_jobs: int = Field(default=1, ge=1, le=8)
    max_queued_jobs: int = Field(default=4, ge=0, le=100)
    job_timeout_seconds: int = Field(default=1800, ge=10, le=24 * 3600)
    job_ttl_seconds: int = Field(default=3600, ge=60, le=7 * 24 * 3600)
    sync_wait_seconds: int = Field(default=60, ge=1, le=600)
    job_dir: str = Field(default="", description="Temporary directory root. Empty = system temp.")

    # --- model weights ---
    allow_weight_download: bool = Field(
        default=False,
        description="Allow the server to download model weights on first use. Off by default: the "
                    "MobileNetV1 checkpoint licence is unresolved, so an operator must opt in explicitly.")

    # --- video (experimental) ---
    video_enabled: bool = True
    video_max_upload_mb: int = Field(default=50, ge=1, le=500)
    video_max_duration_s: float = Field(default=10.0, ge=0.5, le=600)
    video_max_pixels: int = Field(default=512 * 512, ge=1024, le=4096 * 4096,
                                  description="Max width*height of a video frame after rotation.")
    video_max_fps: float = Field(default=30.0, ge=1, le=120)
    video_max_frames: int = Field(default=300, ge=1, le=20000)
    video_max_keyframes: int = Field(default=4, ge=1, le=64,
                                     description="Max number of frames sent through the image engine per video.")
    video_max_temp_mb: int = Field(default=1024, ge=16, le=102400,
                                   description="Upper bound on estimated raw frame storage per job.")
    video_ffmpeg_timeout_s: int = Field(default=300, ge=5, le=7200, description="Per ffmpeg/ffprobe call.")
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"

    # --- security ---
    # disabled: development only. api_key: callers must present an access key (entered by the user,
    # never embedded in website JavaScript). open: no access key; per-job ownership tokens and rate
    # limits still apply. Every mode enforces per-job ownership tokens on job-level operations.
    auth_mode: Literal["disabled", "api_key", "open"] = "disabled"
    api_key_sha256: str = Field(default="", description="Comma-separated SHA-256 hex digests of API keys.")
    rate_limit_per_minute: int = Field(default=30, ge=0, le=100000,
                                       description="Job creation (uploads), per client address.")
    read_rate_limit_per_minute: int = Field(default=600, ge=0, le=100000,
                                            description="Status polling and downloads, per client address.")
    production_mode: bool = False
    cors_origins: str = ""
    log_level: str = "INFO"

    @field_validator("cors_origins")
    @classmethod
    def no_wildcard(cls, v: str) -> str:
        if "*" in [o.strip() for o in v.split(",") if o.strip()]:
            raise ValueError(
                "SHIELD_CORS_ORIGINS='*' is not permitted. List explicit allowed origins "
                "(e.g. https://ghosting.site). A wildcard CORS policy defeats job-token isolation.")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def api_key_digests(self) -> list[str]:
        return [d.strip().lower() for d in self.api_key_sha256.split(",") if d.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
