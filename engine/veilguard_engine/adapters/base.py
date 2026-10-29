"""
Base class for all algorithm adapters.

Every research algorithm must implement this interface.
The status field is critical: it must accurately reflect whether the algorithm
is production-ready, experimental, blocked or unavailable.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Callable


class AlgorithmAdapter(ABC):
    """Abstract base for all VeilGuard algorithm adapters."""

    @property
    @abstractmethod
    def algorithm_id(self) -> str:
        """Stable machine-readable ID, e.g. 'baseline-pixel-noise'."""

    @abstractmethod
    def descriptor(self) -> dict[str, Any]:
        """
        Return a dict matching the AlgorithmDescriptor TypeScript interface.
        Must include at minimum: id, name, description, status, supportedDevices,
        requiresGpu, commercialUseReviewed.
        """

    @abstractmethod
    def run(
        self,
        input_path: Path,
        output_path: Path,
        params: dict[str, Any],
        device: str,
        seed: int | None,
        timeout_seconds: float,
        progress_callback: Callable[[int, str], None],
    ) -> dict[str, Any]:
        """
        Process the image.

        Returns a dict with:
          status: "success" | "failure"
          outputFormat: str (on success)
          warnings: list[str] (on success)
          limitationNotices: list[str] (on success)
          peakMemoryMb: float | None (on success)
          error: {code, message, detail} (on failure)
        """
