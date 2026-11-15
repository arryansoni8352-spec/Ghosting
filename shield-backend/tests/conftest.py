"""Shared test helpers.

Two test groups:
- offline (default): runs without network access and without model weights.
- model: marked with @pytest.mark.model. Requires VERIFIED weights. If the weights cannot be
  obtained, these tests FAIL with a 'MODEL UNAVAILABLE' message. They are never silently skipped.

    pytest -m "not model"   # offline group
    pytest -m model         # model-dependent group
"""
import pytest

from app.engines.style_shield.weights import (
    MOBILENET_V1_NOTOP, WeightDownloadError, WeightIntegrityError, WeightSpec, ensure_weights,
)


def require_model_weights(spec: WeightSpec = MOBILENET_V1_NOTOP):
    """Return the verified weights path for `spec`, or FAIL the test explicitly (never skip)."""
    try:
        return ensure_weights(spec)
    except (WeightIntegrityError, WeightDownloadError, FileNotFoundError, OSError) as exc:
        pytest.fail(f"MODEL UNAVAILABLE ({spec.name}): {exc}. "
                   f"Run: python -m app.cli check-models --download", pytrace=False)
