"""INFRASTRUCTURE / API TEST. Checks the skeleton, schemas or device logic only.
It does NOT demonstrate adversarial protection."""
import pytest
from pydantic import ValidationError

from app.schemas.protect import ProtectOptions


def test_defaults_valid():
    o = ProtectOptions()
    assert o.strength.value == "balanced"


def test_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        ProtectOptions(strength="low", brightness=1.2)


def test_rejects_out_of_range_budget():
    with pytest.raises(ValidationError):
        ProtectOptions(perturbation_budget=5)
