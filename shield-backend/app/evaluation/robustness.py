"""Robustness transforms applied to a protected image BEFORE re-evaluation.

Each transform answers: "does the protection survive an ordinary image-processing step a real
pipeline might apply?" This is separate from, and does not change, the perturbation budget
enforcement in app/engines/style_shield — it operates on the ALREADY-encoded protected output.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image


def resize_round_trip(arr: np.ndarray, scale: float = 0.5) -> np.ndarray:
    """Downscale then upscale back to the original size (bilinear), a common web-pipeline step."""
    h, w = arr.shape[:2]
    small = (max(1, int(w * scale)), max(1, int(h * scale)))
    img = Image.fromarray(arr).resize(small, Image.BILINEAR).resize((w, h), Image.BILINEAR)
    return np.asarray(img, dtype=np.uint8)


def jpeg_recompress(arr: np.ndarray, quality: int = 75) -> np.ndarray:
    """Encode to JPEG and decode back, simulating a lossy re-save."""
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return np.asarray(Image.open(buf).convert("RGB"), dtype=np.uint8)


TRANSFORMS = {
    "none": lambda a: a,
    "resize_round_trip_0.5": resize_round_trip,
    "jpeg_q75": jpeg_recompress,
}
