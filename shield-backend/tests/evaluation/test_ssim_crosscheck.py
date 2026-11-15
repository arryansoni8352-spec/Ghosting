"""Cross-check our NumPy SSIM against scikit-image's reference implementation.

Skipped automatically if scikit-image is not installed. scikit-image is BSD-3-Clause.
"""
import numpy as np
import pytest

from app.evaluation import metrics, synthetic
from tests.fixtures import fixed_noise_fixture

skimage_metrics = pytest.importorskip("skimage.metrics")


def reference_ssim(a, b):
    return skimage_metrics.structural_similarity(
        a, b, data_range=255, channel_axis=-1 if a.ndim == 3 else None,
        gaussian_weights=True, sigma=1.5, use_sample_covariance=False, win_size=11,
    )


@pytest.mark.parametrize("kind", synthetic.KINDS)
def test_matches_reference_on_synthetic_images(kind):
    a = synthetic.make(kind, 96, 80, seed=7)
    b = fixed_noise_fixture(a, amplitude=6, seed=3)
    assert metrics.ssim(a, b) == pytest.approx(reference_ssim(a, b), abs=1e-6)


def test_matches_reference_on_grayscale():
    a = synthetic.make("shapes", 64, 64)[..., 0]
    b = fixed_noise_fixture(a, amplitude=10, seed=5)
    assert metrics.ssim(a, b) == pytest.approx(reference_ssim(a, b), abs=1e-6)
