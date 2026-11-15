"""Exact 8-bit perturbation budget.

The budget ε is a fraction of the 0-255 range. Because pixels are 8-bit integers, the largest
change allowed for a channel is the integer m = floor(ε·255). This module enforces |out - orig| ≤ m
on the integers that are actually written. There is no extra tolerance.
"""
from __future__ import annotations

import math

import numpy as np

from app.core.errors import InvalidOptionError, VerificationError


def integer_budget(epsilon: float) -> int:
    m = int(math.floor(epsilon * 255.0 + 1e-9))
    if m < 1:
        raise InvalidOptionError("The requested budget permits no 8-bit change; increase epsilon.")
    return m


def apply_integer_budget(orig_u8: np.ndarray, delta01: np.ndarray, m: int) -> np.ndarray:
    """Round a float perturbation (in [0,1] units) to integers and clip it to ±m.

    Clipping to [0,255] only shrinks |change|, so the result always satisfies |out - orig| ≤ m.
    `delta01` must already be zero wherever the pixel must not change (e.g. transparent pixels).
    """
    d = np.clip(np.rint(np.asarray(delta01, dtype=np.float64) * 255.0), -m, m).astype(np.int16)
    out = np.clip(orig_u8.astype(np.int16) + d, 0, 255).astype(np.uint8)
    return out


def max_abs_change(orig_u8: np.ndarray, out_u8: np.ndarray, visible_mask: np.ndarray | None = None) -> int:
    """Largest absolute change, optionally over only the pixels where visible_mask is truthy.

    Fully transparent pixels (alpha == 0) are excluded by convention: codecs (notably lossless
    WebP) may discard colour at those pixels since they are invisible, and our own optimiser never
    perturbs them either (see engine.py's alpha mask). A deviation there is a codec artifact, not
    a protection concern.
    """
    diff = np.abs(out_u8.astype(np.int16) - orig_u8.astype(np.int16))
    if visible_mask is not None:
        if not np.any(visible_mask):
            return 0
        diff = diff[visible_mask]
    return int(np.max(diff)) if diff.size else 0


def assert_within_budget(orig_u8: np.ndarray, out_u8: np.ndarray, m: int, where: str,
                         visible_mask: np.ndarray | None = None) -> int:
    """Raise VerificationError if any VISIBLE pixel changed by more than m integer levels."""
    worst = max_abs_change(orig_u8, out_u8, visible_mask)
    if worst > m:
        raise VerificationError(f"perturbation budget exceeded at {where}: {worst} > {m}")
    return worst


def measure_codec_noise(src, out_format: str, quality: int | None, lossless: bool = False,
                        visible_mask: np.ndarray | None = None) -> int:
    """Encode the ORIGINAL pixels (zero perturbation) and measure the codec's own deviation.

    This isolates codec-induced change from the cloak's own change: a lossy codec (JPEG, lossy
    WebP) can alter pixels by tens of 8-bit levels purely from quantisation and chroma
    subsampling, even with no perturbation applied. Used as a fast pre-flight check before
    spending time on optimisation for a budget that cannot possibly be met.
    """
    from app.utils import images
    enc = images.encode(src.mode, src.pixels, src.alpha, out_format, quality=quality, lossless=lossless)
    out = images.verify_encoded(enc, out_format, src)
    pix = out.pixels[..., 0] if (src.is_grayscale and out.mode in ("RGB", "RGBA")) else out.pixels
    src_pix = src.pixels
    return max_abs_change(src_pix, pix, visible_mask)
