"""Compare an original image with a derived image and produce a quality report.

Scope: visual similarity and file size only. The report deliberately has NO field that could be
read as "protection achieved". Effectiveness lives in a separate report type (later phase).
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

import numpy as np

from app.evaluation import metrics
from app.utils import images


@dataclass
class QualityReport:
    width: int
    height: int
    channels: int
    original_bytes: int
    derived_bytes: int
    size_ratio: float | None            # derived_bytes / original_bytes; None if original_bytes is 0
    mse: float
    psnr_db: float | None             # None when images are identical (PSNR is infinite)
    ssim: float
    mean_absolute_difference: float   # 0..255 scale
    max_abs_difference: int           # largest single-channel change, 0..255
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def compare_arrays(original: np.ndarray, derived: np.ndarray, original_bytes: int = 0,
                   derived_bytes: int = 0) -> QualityReport:
    if original.shape != derived.shape:
        raise ValueError(f"dimension mismatch: {original.shape} vs {derived.shape}")
    notes: list[str] = []
    h, w = original.shape[:2]
    c = 1 if original.ndim == 2 else original.shape[2]
    if min(h, w) < 11:
        raise ValueError("images must be at least 11px on each side for SSIM")

    p = metrics.psnr(original, derived)
    psnr_val: float | None
    if math.isinf(p):
        psnr_val = None
        notes.append("images are identical; PSNR is infinite and reported as null")
    else:
        psnr_val = round(p, 6)

    diff = np.abs(original.astype(np.int16) - derived.astype(np.int16))
    ratio = (derived_bytes / original_bytes) if original_bytes else None
    return QualityReport(
        width=w, height=h, channels=c,
        original_bytes=original_bytes, derived_bytes=derived_bytes,
        size_ratio=round(ratio, 6) if ratio is not None else None,
        mse=round(metrics.mse(original, derived), 6),
        psnr_db=psnr_val,
        ssim=round(metrics.ssim(original, derived), 6),
        mean_absolute_difference=round(metrics.mean_absolute_difference(original, derived), 6),
        max_abs_difference=int(diff.max()),
        notes=notes,
    )


def compare_bytes(original_bytes: bytes, derived_bytes: bytes) -> QualityReport:
    """Compare two encoded images. Dimensions must match exactly."""
    if images.dimensions(original_bytes) != images.dimensions(derived_bytes):
        raise ValueError(
            f"dimension mismatch: {images.dimensions(original_bytes)} vs "
            f"{images.dimensions(derived_bytes)}"
        )
    a = images.decode_rgb(original_bytes)
    b = images.decode_rgb(derived_bytes)
    return compare_arrays(a, b, len(original_bytes), len(derived_bytes))
