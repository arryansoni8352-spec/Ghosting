import math

import numpy as np
import pytest

from app.evaluation import synthetic
from app.evaluation.compare import compare_arrays


@pytest.mark.parametrize("kind", synthetic.KINDS)
def test_synthetic_is_deterministic(kind):
    a = synthetic.make(kind, 64, 48, seed=5)
    b = synthetic.make(kind, 64, 48, seed=5)
    assert np.array_equal(a, b)
    assert a.dtype == np.uint8 and a.shape == (48, 64, 3)


def test_synthetic_seed_changes_random_kinds():
    a = synthetic.make("texture", 64, 48, seed=1)
    b = synthetic.make("texture", 64, 48, seed=2)
    assert not np.array_equal(a, b)


def test_synthetic_rejects_bad_input():
    with pytest.raises(ValueError):
        synthetic.make("nope")
    with pytest.raises(ValueError):
        synthetic.make("gradient", 8, 8)


def test_report_identical_images_has_null_psnr_and_note():
    img = synthetic.make("gradient", 32, 32)
    r = compare_arrays(img, img.copy(), 100, 100)
    assert r.psnr_db is None
    assert r.notes and "identical" in r.notes[0]
    assert r.max_abs_difference == 0
    assert r.size_ratio == 1.0


def test_report_has_no_effectiveness_field():
    """Visual quality must never be confused with protection effectiveness."""
    img = synthetic.make("gradient", 32, 32)
    fields = set(compare_arrays(img, img, 1, 1).to_dict())
    assert not any("protect" in f or "effective" in f for f in fields)


def test_report_dimensions_and_sizes():
    a = synthetic.make("shapes", 50, 40)
    b = np.clip(a.astype(int) + 3, 0, 255).astype(np.uint8)
    r = compare_arrays(a, b, original_bytes=1000, derived_bytes=250)
    assert (r.width, r.height, r.channels) == (50, 40, 3)
    assert r.size_ratio == 0.25
    assert r.psnr_db is not None and math.isfinite(r.psnr_db)
