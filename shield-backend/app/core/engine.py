"""Common engine contract. Phase 1 defines the interface and stubs only."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.core.errors import EngineNotImplementedError
from app.schemas.common import EngineName, ProtectionStrength


@dataclass
class EngineDescription:
    engine: EngineName
    display_name: str
    implemented: bool
    summary: str
    target_scenarios: list[str]
    limitations: list[str]
    research_basis: list[str]
    models: list[dict[str, Any]] = field(default_factory=list)


class ProtectionEngine(ABC):
    """Every engine implements this. The API depends only on this interface."""

    name: EngineName
    implemented: bool = False

    @abstractmethod
    def describe(self) -> EngineDescription: ...

    def protect(self, image_bytes: bytes, strength: ProtectionStrength, options: dict) -> Any:
        """Return (protected_bytes, report). Stubs refuse rather than return fake output."""
        raise EngineNotImplementedError(
            f"{self.name.value} optimisation is not implemented yet (planned for a later phase)."
        )
