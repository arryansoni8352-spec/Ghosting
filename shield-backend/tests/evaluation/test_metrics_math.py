"""Metric correctness on images whose answers are known analytically."""
import math

import numpy as np
import pytest

from app.evaluation import metrics
from tests.fixtures import constant_offset, fixed_noise_fixture


def mid_gray(h=32, w=40, value=100):
    return np.full((h, w, 3), value, dtype=np.uint8)


def test_identical_images():
    img = mid_gray()
    assert metrics.mse(img, img) == 0.0
    assert metrics.mean_absolute_difference(img, img) == 0.0
    assert math.isinf(metrics.psnr(img, img))
    assert metrics.ssim(img, img) == pytest.approx(1.0, abs=1e-12)


@pytest.mark.parametrize("delta", [1, 3, 10])
def test_constant_offset_mad_and_mse_are_exact(delta):
    a = mid_gray(value=100)
    b = constant_offset(a, delta)
    assert metrics.mean_absolute_difference(a, b) == pytest.approx(delta)
    assert metrics.mse(a, b) == pytest.approx(delta ** 2)


@pytest.mark.parametrize("delta", [1, 4, 16])
def test_psnr_matches_formula(delta):
    a = mid_gray(value=100)
    b = constant_offset(a, delta)
    expected = 10 * math.log10(255 ** 2 / delta ** 2)
    assert metrics.psnr(a, b) == pytest.approx(expected, rel=1e-12)


def test_ssim_is_symmetric():
    rng = np.random.default_rng(0)
    a = rng.integers(0, 256, size=(40, 48, 3), dtype=np.uint8)
    b = fixed_noise_fixture(a, amplitude=5)
    assert metrics.ssim(a, b) == pytest.approx(metrics.ssim(b, a), abs=1e-12)


def test_ssim_decreases_monotonically_with_noise_amplitude():
    rng = np.random.default_rng(1)
    base = rng.integers(40, 216, size=(64, 64, 3), dtype=np.uint8)
    scores = [metrics.ssim(base, fixed_noise_fixture(base, amp)) for amp in (1, 4, 16, 64)]
    assert all(s1 > s2 for s1, s2 in zip(scores, scores[1:])), scores


def test_ssim_bounded():
    rng = np.random.default_rng(2)
    a = rng.integers(0, 256, size=(32, 32), dtype=np.uint8)
    b = rng.integers(0, 256, size=(32, 32), dtype=np.uint8)
    s = metrics.ssim(a, b)
    assert -1.0 <= s <= 1.0


def test_grayscale_and_colour_both_supported():
    a = np.full((24, 24), 90, dtype=np.uint8)
    b = constant_offset(a, 2)
    assert metrics.mean_absolute_difference(a, b) == pytest.approx(2)
    assert 0 < metrics.ssim(a, b) <= 1


def test_shape_mismatch_raises():
    with pytest.raises(ValueError, match="shape mismatch"):
        metrics.mse(mid_gray(32, 40), mid_gray(30, 40))


def test_ssim_too_small_raises():
    small = np.zeros((8, 8, 3), dtype=np.uint8)
    with pytest.raises(ValueError, match="smaller than SSIM window"):
        metrics.ssim(small, small)


def test_invalid_data_range_raises():
    with pytest.raises(ValueError):
        metrics.psnr(mid_gray(), mid_gray(), data_range=0)


def test_ssim_window_must_be_odd():
    with pytest.raises(ValueError):
        metrics.ssim(mid_gray(), mid_gray(), win_size=10)
