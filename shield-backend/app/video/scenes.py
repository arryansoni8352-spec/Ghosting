"""Scene-change detection on small grayscale signatures.

A cut is declared between frame t-1 and t when the mean absolute difference of the downscaled frames
(0..1) is very large, or when the grey-level histogram distance (total variation, 0..1) is large AND the
frames also differ noticeably (a histogram alone is too sensitive to noise on flat content).
Thresholds are conservative defaults and have only been exercised on synthetic clips; they are not
tuned on natural footage (see the research-limitations document).
"""
from __future__ import annotations

import numpy as np

SIG_WIDTH = 64
HIST_BINS = 32


def signature(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(downscaled gray float32 in 0..1, normalised histogram) for one RGB uint8 frame."""
    gray = (rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114).astype(np.float32) / 255.0
    h, w = gray.shape
    f = max(1, w // SIG_WIDTH)
    hh, ww = (h // f) * f, (w // f) * f
    small = gray[:hh, :ww].reshape(hh // f, f, ww // f, f).mean(axis=(1, 3))
    hist, _ = np.histogram(gray, bins=HIST_BINS, range=(0.0, 1.0))
    return small, hist.astype(np.float32) / max(1, gray.size)


def scene_starts(sigs: list[tuple[np.ndarray, np.ndarray]], hist_threshold: float = 0.45,
                 mad_threshold: float = 0.30, hist_min_mad: float = 0.08) -> list[int]:
    """Indices where a new scene begins. Always contains 0 for a non-empty clip."""
    if not sigs:
        return []
    starts = [0]
    for t in range(1, len(sigs)):
        (a, ha), (b, hb) = sigs[t - 1], sigs[t]
        tv = 0.5 * float(np.abs(ha - hb).sum())
        mad = float(np.abs(a - b).mean()) if a.shape == b.shape else 1.0
        if mad > mad_threshold or (tv > hist_threshold and mad > hist_min_mad):
            starts.append(t)
    return starts
