"""The image-protection step used on keyframes.

`FrameProtector` is the seam between the video pipeline and the image engine. Production uses
`StyleShieldFrameProtector` (the real JAX engine). Unit tests use a deterministic stand-in so the
pipeline, audio handling and temporal logic can be tested without model weights; model-dependent
integration tests are kept separate (tests/video/test_video_model_integration.py, marker `model`).
"""
from __future__ import annotations

import io
from typing import Protocol

import numpy as np
from PIL import Image


class FrameProtector(Protocol):
    budget_levels: int

    def protect(self, rgb: np.ndarray, control, index: int) -> tuple[np.ndarray, dict]:
        """Return (protected RGB uint8 array of the same shape, small summary dict)."""


class StyleShieldFrameProtector:
    def __init__(self, engine, strength: str, seed: int = 0, max_steps: int | None = None):
        from app.engines.style_shield import optimise as opt
        from app.engines.style_shield.budget import integer_budget
        self._engine, self._strength, self._seed, self._max_steps = engine, strength, seed, max_steps
        self.budget_levels = integer_budget(opt.PRESETS[strength].epsilon)

    def protect(self, rgb: np.ndarray, control, index: int):
        from app.utils import images
        src = images.Decoded("RGB", rgb, None, "PNG", "RGB")
        res = self._engine.run(src, self._strength, out_format="png", seed=self._seed + index,
                               max_steps=self._max_steps, control=control,
                               input_bytes_len=int(rgb.nbytes))
        out = np.asarray(Image.open(io.BytesIO(res.encoded)).convert("RGB"), dtype=np.uint8).copy()
        rec = res.record
        return out, {
            "target_style": rec.get("target_style"),
            "budget_integer_levels": rec["output"]["budget_integer_levels"],
            "max_change_after_encoding": rec["output"]["max_change_after_encoding"],
            "budget_satisfied_after_encoding": rec["output"]["budget_satisfied_after_encoding"],
            "ssim": (rec.get("quality") or {}).get("ssim"),
            "seconds": rec["timing_seconds"]["total"],
        }
