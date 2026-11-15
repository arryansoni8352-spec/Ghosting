"""Deterministic synthetic test images. Same kind + size + seed always gives the same pixels.

These exist only to exercise metrics and codecs. They are not photographs or artworks, and
results on them should not be presented as representative of real images.
"""
from __future__ import annotations

import numpy as np

KINDS = ("gradient", "checkerboard", "shapes", "texture", "photo_like")


def make(kind: str, width: int = 128, height: int = 96, seed: int = 0) -> np.ndarray:
    if kind not in KINDS:
        raise ValueError(f"unknown kind '{kind}'; choose from {KINDS}")
    if width < 16 or height < 16:
        raise ValueError("minimum size is 16x16")
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float64)

    if kind == "gradient":
        r = 255.0 * xx / (width - 1)
        g = 255.0 * yy / (height - 1)
        b = 255.0 * (xx + yy) / (width + height - 2)
        img = np.stack([r, g, b], axis=-1)
    elif kind == "checkerboard":
        cell = max(4, min(width, height) // 8)
        mask = ((xx // cell + yy // cell) % 2).astype(np.float64)
        img = np.stack([mask * 255, mask * 128, (1 - mask) * 255], axis=-1)
    elif kind == "shapes":
        img = np.full((height, width, 3), 200.0)
        cx, cy, rad = width * 0.35, height * 0.45, min(width, height) * 0.25
        disc = (xx - cx) ** 2 + (yy - cy) ** 2 <= rad ** 2
        img[disc] = (40.0, 90.0, 160.0)
        img[(xx > width * 0.6) & (yy > height * 0.5)] = (220.0, 60.0, 50.0)
    elif kind == "texture":
        base = rng.uniform(0, 255, size=(height, width, 3))
        img = 0.5 * base + 0.5 * 128.0
    else:  # photo_like: smooth low-frequency content plus mild grain
        smooth = (
            128
            + 60 * np.sin(xx / max(width, 1) * 2.0 * np.pi)
            + 40 * np.cos(yy / max(height, 1) * 3.0 * np.pi)
        )
        grain = rng.normal(0.0, 3.0, size=(height, width))
        base = smooth + grain
        img = np.stack([base, base * 0.9 + 15, base * 0.8 + 30], axis=-1)

    return np.clip(np.rint(img), 0, 255).astype(np.uint8)
