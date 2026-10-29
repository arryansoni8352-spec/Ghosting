"""
Algorithm adapter registry.

Each adapter is registered here with its stable ID.
The registry is the single source of truth for what algorithms are available.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .baseline import BaselinePixelNoiseAdapter
from .photoguard import PhotoGuardEncoderAdapter
from .feature_disruption import FeatureDisruptionAdapter

if TYPE_CHECKING:
    from .base import AlgorithmAdapter

_REGISTRY: dict[str, "AlgorithmAdapter"] | None = None


def get_registry() -> dict[str, "AlgorithmAdapter"]:
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = {}
        _register(BaselinePixelNoiseAdapter())
        _register(FeatureDisruptionAdapter())
        _register(PhotoGuardEncoderAdapter())
    return _REGISTRY


def _register(adapter: "AlgorithmAdapter") -> None:
    assert _REGISTRY is not None
    _REGISTRY[adapter.algorithm_id] = adapter
