"""Visual-quality metrics: MSE, PSNR, SSIM, mean absolute difference.

These measure how different two images LOOK, nothing more. They say nothing about whether an
AI model can or cannot recognise or imitate an image. Protection effectiveness is a separate
evaluation (see app/evaluation/effectiveness.py, planned for a later phase).

Conventions
- Inputs are HxWx3 (RGB) or HxW (grayscale) arrays. Values are on the 0..data_range scale.
- Both inputs must have identical shape. Mismatches raise ValueError; they are never resized.
- All functions are deterministic and use float64 internally.
"""
from __future__ import annotations

import math

import numpy as np

_DEF_RANGE = 255.0


def _prepare(a: np.ndarray, b: np.ndarray, data_range: float) -> tuple[np.ndarray, np.ndarray]:
    if data_range <= 0:
        raise ValueError("data_range must be positive")
    a = np.asarray(a)
    b = np.asarray(b)
    if a.shape != b.shape:
        raise ValueError(f"shape mismatch: {a.shape} vs {b.shape}")
    if a.ndim not in (2, 3):
        raise ValueError(f"expected 2D or 3D image array, got {a.ndim}D")
    return a.astype(np.float64), b.astype(np.float64)


def mse(a: np.ndarray, b: np.ndarray, data_range: float = _DEF_RANGE) -> float:
    """Mean squared error on the data_range scale."""
    x, y = _prepare(a, b, data_range)
    return float(np.mean((x - y) ** 2))


def mean_absolute_difference(a: np.ndarray, b: np.ndarray, data_range: float = _DEF_RANGE) -> float:
    """Mean absolute pixel difference on the 0..data_range scale (e.g. 0..255 for uint8)."""
    x, y = _prepare(a, b, data_range)
    return float(np.mean(np.abs(x - y)))


def psnr(a: np.ndarray, b: np.ndarray, data_range: float = _DEF_RANGE) -> float:
    """Peak signal-to-noise ratio in dB: 10*log10(data_range^2 / MSE).

    Returns math.inf when the images are identical (MSE == 0).
    """
    m = mse(a, b, data_range)
    if m == 0.0:
        return math.inf
    return 10.0 * math.log10((data_range ** 2) / m)


# ---------- SSIM (Wang et al., 2004), Gaussian window ----------

def _gaussian_kernel(win_size: int, sigma: float) -> np.ndarray:
    if win_size % 2 != 1 or win_size < 3:
        raise ValueError("win_size must be an odd integer >= 3")
    r = (win_size - 1) // 2
    xs = np.arange(-r, r + 1, dtype=np.float64)
    k = np.exp(-(xs ** 2) / (2.0 * sigma ** 2))
    return k / k.sum()


def _valid_filter(img: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    """Separable 'valid' Gaussian filter on a 2D array (no padding, output shrinks by win-1)."""
    from numpy.lib.stride_tricks import sliding_window_view

    rows = sliding_window_view(img, kernel.size, axis=1) @ kernel      # (H, W-w+1)
    return sliding_window_view(rows, kernel.size, axis=0) @ kernel     # (H-w+1, W-w+1)


def _ssim_2d(x: np.ndarray, y: np.ndarray, data_range: float, win_size: int,
             sigma: float, k1: float, k2: float) -> float:
    kernel = _gaussian_kernel(win_size, sigma)
    c1 = (k1 * data_range) ** 2
    c2 = (k2 * data_range) ** 2
    mu_x = _valid_filter(x, kernel)
    mu_y = _valid_filter(y, kernel)
    sxx = _valid_filter(x * x, kernel) - mu_x ** 2
    syy = _valid_filter(y * y, kernel) - mu_y ** 2
    sxy = _valid_filter(x * y, kernel) - mu_x * mu_y
    num = (2 * mu_x * mu_y + c1) * (2 * sxy + c2)
    den = (mu_x ** 2 + mu_y ** 2 + c1) * (sxx + syy + c2)
    return float(np.mean(num / den))


def ssim(a: np.ndarray, b: np.ndarray, data_range: float = _DEF_RANGE, win_size: int = 11,
         sigma: float = 1.5, k1: float = 0.01, k2: float = 0.03) -> float:
    """Mean SSIM over the image, computed per channel and averaged for colour images.

    Parameters match the standard Gaussian-window SSIM (11x11, sigma 1.5, K1=0.01, K2=0.03).
    Border pixels within (win_size-1)/2 of the edge are excluded ('valid' region only).
    Images smaller than win_size raise ValueError.
    """
    x, y = _prepare(a, b, data_range)
    if min(x.shape[0], x.shape[1]) < win_size:
        raise ValueError(f"image smaller than SSIM window ({win_size}px)")
    if x.ndim == 2:
        return _ssim_2d(x, y, data_range, win_size, sigma, k1, k2)
    scores = [
        _ssim_2d(x[..., c], y[..., c], data_range, win_size, sigma, k1, k2)
        for c in range(x.shape[2])
    ]
    return float(np.mean(scores))
