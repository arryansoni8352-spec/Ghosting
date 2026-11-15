"""Schemas describing engines and the models they depend on. Filled from engine.describe()."""
from pydantic import BaseModel, Field

from app.schemas.common import EngineName


class ModelInfo(BaseModel):
    name: str
    version: str | None = None
    licence: str | None = Field(default=None, description="SPDX id or 'UNCONFIRMED'.")
    source_url: str | None = None
    loaded: bool = False


class EngineInfo(BaseModel):
    engine: EngineName
    display_name: str
    implemented: bool
    summary: str
    target_scenarios: list[str]
    limitations: list[str]
    models: list[ModelInfo]
    research_basis: list[str]


class ModelsResponse(BaseModel):
    engines: list[EngineInfo]
