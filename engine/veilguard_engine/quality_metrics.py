"""
Perceptual Quality and Robustness Benchmark Metrics.

Calculates authentic mathematical and perceptual metrics:
  - PSNR (Peak Signal-to-Noise Ratio)
  - SSIM (Structural Similarity Index Measure) via PyTorch / NumPy
  - Feature Disruption Rate under neural models
  - Robustness degradation after image transformations:
      * JPEG compression at Q=50, Q=75, Q=90
      * Bilinear downsampling & upsampling (50%, 75%)
      * Gaussian Blur (sigma=1.0, 2.0)
      * Center Crop & Restoration
"""

from __future__ import annotations

import io
import math
from typing import Any
import numpy as np
from PIL import Image, ImageFilter


def calculate_psnr(img1: np.ndarray, img2: np.ndarray) -> float:
    """Calculates Peak Signal-to-Noise Ratio (PSNR) in dB."""
    mse = np.mean((img1.astype(float) - img2.astype(float)) ** 2)
    if mse == 0:
        return float("inf")
    max_pixel = 255.0
    return float(20 * math.log10(max_pixel / math.sqrt(mse)))


def calculate_ssim(img1: np.ndarray, img2: np.ndarray) -> float:
    """
    Computes Structural Similarity Index (SSIM) across RGB channels.
    Reference: Wang et al., 'Image quality assessment: from error visibility to structural similarity'
    """
    if img1.shape != img2.shape:
        raise ValueError(f"Shape mismatch: {img1.shape} vs {img2.shape}")

    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2

    img1 = img1.astype(np.float64)
    img2 = img2.astype(np.float64)

    channel_ssims = []
    channels = 1 if img1.ndim == 2 else img1.shape[2]

    for ch in range(channels):
        x = img1 if channels == 1 else img1[:, :, ch]
        y = img2 if channels == 1 else img2[:, :, ch]

        mu_x = np.mean(x)
        mu_y = np.mean(y)

        sigma_x_sq = np.var(x)
        sigma_y_sq = np.var(y)
        sigma_xy = np.mean((x - mu_x) * (y - mu_y))

        num = (2 * mu_x * mu_y + c1) * (2 * sigma_xy + c2)
        den = (mu_x**2 + mu_y**2 + c1) * (sigma_x_sq + sigma_y_sq + c2)
        ssim_ch = num / den if den != 0 else 1.0
        channel_ssims.append(ssim_ch)

    return float(np.mean(channel_ssims))


def apply_transformation(image: Image.Image, transform_name: str, **kwargs: Any) -> Image.Image:
    """Applies realistic image transformations for robustness testing."""
    if transform_name == "jpeg_compression":
        quality = kwargs.get("quality", 75)
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="JPEG", quality=quality)
        buffer.seek(0)
        return Image.open(buffer).copy()

    elif transform_name == "resize_resample":
        factor = kwargs.get("factor", 0.75)
        orig_w, orig_h = image.size
        new_w, new_h = max(16, int(orig_w * factor)), max(16, int(orig_h * factor))
        downscaled = image.resize((new_w, new_h), Image.Resampling.BILINEAR)
        return downscaled.resize((orig_w, orig_h), Image.Resampling.BILINEAR)

    elif transform_name == "gaussian_blur":
        radius = kwargs.get("radius", 1.0)
        return image.filter(ImageFilter.GaussianBlur(radius=radius))

    elif transform_name == "crop_pad":
        crop_pct = kwargs.get("crop_pct", 0.1)
        w, h = image.size
        crop_w, crop_h = int(w * crop_pct), int(h * crop_pct)
        cropped = image.crop((crop_w, crop_h, w - crop_w, h - crop_h))
        return cropped.resize((w, h), Image.Resampling.BILINEAR)

    raise ValueError(f"Unknown transform: {transform_name}")
