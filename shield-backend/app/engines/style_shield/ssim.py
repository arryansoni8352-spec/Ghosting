"""Differentiable SSIM in JAX, with the same definition as app/evaluation/metrics.py.

Inputs are NHWC arrays on the [0, 1] scale. The Gaussian window is separable (11 taps, sigma 1.5),
applied with 'valid' convolutions, so the output has the same valid-region semantics as the NumPy
implementation. A test checks the two agree.
"""
from __future__ import annotations

import jax
import jax.numpy as jnp
import numpy as np
from jax import lax

_DN = ("NHWC", "HWIO", "NHWC")


def gaussian_1d(win: int = 11, sigma: float = 1.5) -> np.ndarray:
    r = (win - 1) / 2.0
    xs = np.arange(win, dtype=np.float64) - r
    k = np.exp(-(xs ** 2) / (2 * sigma ** 2))
    return (k / k.sum()).astype(np.float32)


_K = gaussian_1d()


def _blur(x):
    """x: N x H x W x C -> valid separable Gaussian blur."""
    n, h, w, c = x.shape
    t = jnp.transpose(x, (0, 3, 1, 2)).reshape(n * c, h, w, 1)
    kv = jnp.asarray(_K).reshape(len(_K), 1, 1, 1)
    kh = jnp.asarray(_K).reshape(1, len(_K), 1, 1)
    t = lax.conv_general_dilated(t, kv, (1, 1), "VALID", dimension_numbers=_DN)
    t = lax.conv_general_dilated(t, kh, (1, 1), "VALID", dimension_numbers=_DN)
    h2, w2 = t.shape[1], t.shape[2]
    return jnp.transpose(t.reshape(n, c, h2, w2), (0, 2, 3, 1))


@jax.jit
def ssim(x, y):
    """Mean SSIM over batch, space and channels (data range 1.0)."""
    c1, c2 = (0.01) ** 2, (0.03) ** 2
    mu_x, mu_y = _blur(x), _blur(y)
    sxx = _blur(x * x) - mu_x ** 2
    syy = _blur(y * y) - mu_y ** 2
    sxy = _blur(x * y) - mu_x * mu_y
    num = (2 * mu_x * mu_y + c1) * (2 * sxy + c2)
    den = (mu_x ** 2 + mu_y ** 2 + c1) * (sxx + syy + c2)
    return jnp.mean(num / den)


@jax.jit
def dssim_distance(x, y):
    """D_s = (1 - SSIM) / 2 in [0, 1]."""
    return (1.0 - ssim(x, y)) / 2.0
