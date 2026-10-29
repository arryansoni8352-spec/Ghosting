"""
Baseline Pixel Noise Adapter.

⚠️  EXPERIMENTAL — NOT PhotoGuard-equivalent protection.

This adapter adds a small, bounded random perturbation to pixel values.
It is included ONLY as a functional baseline to exercise the engine pipeline
end-to-end during development.

It does NOT implement any peer-reviewed image immunization technique.
It has NOT been validated against any specific AI image-editing system.
It MUST NOT be presented to users as equivalent to academic image protection.
"""

from __future__ import annotations

import os
import time
import traceback
from pathlib import Path
from typing import Any, Callable

import numpy as np
from PIL import Image, ImageOps

from .base import AlgorithmAdapter


class BaselinePixelNoiseAdapter(AlgorithmAdapter):
    """
    Adds bounded uniform random noise to each pixel channel.
    Explicitly labeled EXPERIMENTAL in all user-facing output.
    """

    @property
    def algorithm_id(self) -> str:
        return "baseline-pixel-noise"

    def descriptor(self) -> dict[str, Any]:
        return {
            "id": self.algorithm_id,
            "name": "Baseline Random Noise (Experimental)",
            "description": (
                "Adds a small bounded random perturbation to pixel values. "
                "This is a development baseline only — it has NOT been validated "
                "against any AI image-editing system and does not implement "
                "PhotoGuard or any peer-reviewed immunization technique."
            ),
            "status": "EXPERIMENTAL",
            "statusReason": (
                "This algorithm has not been validated against any AI image-editing system. "
                "Use for development and pipeline testing only."
            ),
            "supportedDevices": ["cpu"],
            "requiresGpu": False,
            "commercialUseReviewed": False,
            "paperReference": None,
            "officialRepository": None,
            "weightsLicense": None,
        }

    def run(
        self,
        input_path: Path,
        output_path: Path,
        params: dict[str, Any],
        device: str,
        seed: int | None,
        timeout_seconds: float,
        progress_callback: Callable[[int, str], None],
    ) -> dict[str, Any]:
        t_start = time.monotonic()

        try:
            progress_callback(10, "Loading image for noise baseline...")

            # Apply EXIF orientation before processing
            with Image.open(input_path) as img:
                img = ImageOps.exif_transpose(img)
                original_mode = img.mode

                # Validate strength param
                strength = float(params.get("strength", 8.0))
                strength = max(1.0, min(32.0, strength))  # Clamp to [1, 32]

                progress_callback(30, "Applying baseline perturbation...")

                # Work in RGB(A) space
                if img.mode not in ("RGB", "RGBA", "L"):
                    img = img.convert("RGB")

                arr = np.array(img, dtype=np.float32)

                rng = np.random.default_rng(seed)
                noise = rng.uniform(-strength, strength, arr.shape).astype(np.float32)
                perturbed = np.clip(arr + noise, 0, 255).astype(np.uint8)

                progress_callback(70, "Saving protected image...")

                result_img = Image.fromarray(perturbed, mode=img.mode)

                # Determine output format from extension
                ext = output_path.suffix.lower()
                fmt_map = {
                    ".jpg": "JPEG",
                    ".jpeg": "JPEG",
                    ".png": "PNG",
                    ".webp": "WEBP",
                    ".tiff": "TIFF",
                    ".tif": "TIFF",
                }
                pil_format = fmt_map.get(ext, "PNG")
                out_fmt_name = pil_format.lower()

                save_kwargs: dict[str, Any] = {}
                if pil_format == "JPEG":
                    quality = int(params.get("jpegQuality", 92))
                    save_kwargs["quality"] = max(50, min(100, quality))
                    save_kwargs["subsampling"] = 0
                    if result_img.mode == "RGBA":
                        result_img = result_img.convert("RGB")

                result_img.save(str(output_path), format=pil_format, **save_kwargs)

            # Measure post-export difference
            with Image.open(output_path) as reloaded:
                reloaded_arr = np.array(reloaded.convert("RGB"), dtype=np.int32)
            orig_arr = np.array(img.convert("RGB"), dtype=np.int32)
            measured_max_diff = int(np.max(np.abs(orig_arr - reloaded_arr)))

            warnings: list[str] = []
            limitation_notices = [
                "⚠️  EXPERIMENTAL BASELINE: This perturbation has NOT been validated "
                "against any AI image-editing system. Do not interpret this as "
                "genuine image immunization.",
                "The perturbation may be reduced or eliminated by image compression, "
                "resizing, cropping or other transformations.",
                "No guarantee is made that this perturbation will prevent AI editing "
                "of the exported image.",
            ]

            if pil_format == "JPEG":
                linf_guaranteed = False
                msg = (
                    f"JPEG discrete cosine transform (DCT) block quantization introduces lossy encoding artifacts. "
                    f"Post-export maximum pixel difference was {measured_max_diff} (pre-compression budget was {strength:.1f}). "
                    f"Strict L-infinity pixel-bound guarantees apply ONLY to lossless exports (PNG)."
                )
                warnings.append(msg)
                limitation_notices.append(f"⚠️ Lossy format notice: {msg}")
            else:
                linf_guaranteed = measured_max_diff <= int(round(strength))

            progress_callback(100, "Done.")

            elapsed = (time.monotonic() - t_start) * 1000

            return {
                "status": "success",
                "outputFormat": out_fmt_name,
                "measuredMaxPixelDiff": measured_max_diff,
                "linfGuaranteed": linf_guaranteed,
                "warnings": warnings,
                "limitationNotices": limitation_notices,
                "peakMemoryMb": None,
            }

        except Exception as exc:
            return {
                "status": "failure",
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": str(exc),
                    "detail": traceback.format_exc(),
                },
            }
