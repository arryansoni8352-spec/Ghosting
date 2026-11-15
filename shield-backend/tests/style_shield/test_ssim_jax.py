"""The differentiable JAX SSIM must agree with the Phase 2 NumPy SSIM used for all evaluation."""
import numpy as np
import pytest

from app.evaluation import metrics
from app.engines.style_shield.ssim import ssim, dssim_distance


@pytest.mark.parametrize("seed,amp", [(0, 3), (1, 12), (2, 40)])
def test_matches_numpy_ssim(seed, amp):
    rng = np.random.default_rng(seed)
    a = rng.integers(0, 256, (64, 80, 3), dtype=np.uint8)
    b = np.clip(a.astype(int) + rng.integers(-amp, amp + 1, a.shape), 0, 255).astype(np.uint8)
    ref = metrics.ssim(a, b)
    got = float(ssim(a[None].astype(np.float32) / 255, b[None].astype(np.float32) / 255))
    assert got == pytest.approx(ref, abs=1e-5)


def test_identical_images_have_zero_distance():
    a = np.random.default_rng(0).uniform(0, 1, (1, 40, 40, 3)).astype(np.float32)
    assert float(dssim_distance(a, a)) == pytest.approx(0.0, abs=1e-6)


def test_distance_increases_with_perturbation():
    rng = np.random.default_rng(1)
    a = rng.uniform(0, 1, (1, 48, 48, 3)).astype(np.float32)
    small = np.clip(a + 0.01 * rng.standard_normal(a.shape), 0, 1).astype(np.float32)
    large = np.clip(a + 0.1 * rng.standard_normal(a.shape), 0, 1).astype(np.float32)
    assert float(dssim_distance(a, small)) < float(dssim_distance(a, large))
