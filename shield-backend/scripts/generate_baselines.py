"""Generate docs/baselines.json: reproducible metric values for fixed synthetic cases.

Run:  python -m scripts.generate_baselines

Every case is an (original, derived) pair built from a seeded synthetic image.
  - codec cases: the original is PNG; the derived image is the same pixels re-encoded as JPEG/WebP
  - fixture cases: seeded uniform noise added to the pixels (a MEASUREMENT FIXTURE only, not a
    protection method). Its purpose is to pin down how the metrics respond to a known change.
"""
from __future__ import annotations

import json
import pathlib
import platform
import sys

import numpy as np
import PIL

from app.evaluation import synthetic
from app.evaluation.compare import compare_bytes
from app.utils import images
from tests.fixtures import fixed_noise_fixture

BASELINE_PATH = pathlib.Path(__file__).resolve().parent.parent / "docs" / "baselines.json"
SIZE = (96, 80)   # width, height
SEEDS = {"gradient": 0, "checkerboard": 0, "shapes": 0, "texture": 3, "photo_like": 5}


def _record(report) -> dict:
    d = report.to_dict()
    keep = ["width", "height", "channels", "original_bytes", "derived_bytes", "size_ratio",
            "mse", "psnr_db", "ssim", "mean_absolute_difference", "max_abs_difference"]
    return {k: d[k] for k in keep}


def compute_cases() -> dict:
    out: dict = {}
    for kind, seed in SEEDS.items():
        arr = synthetic.make(kind, *SIZE, seed=seed)
        original = images.encode_legacy(arr, "png")
        for q in (95, 75, 40):
            derived = images.encode_legacy(arr, "jpeg", quality=q)
            out[f"{kind}|jpeg|q{q}"] = _record(compare_bytes(original, derived))
        if images.webp_supported():
            derived = images.encode_legacy(arr, "webp", quality=80)
            out[f"{kind}|webp|q80"] = _record(compare_bytes(original, derived))
        for amp in (2, 8):
            noisy = fixed_noise_fixture(arr, amplitude=amp, seed=1234)
            derived = images.encode_legacy(noisy, "png")
            out[f"{kind}|fixture_noise|amp{amp}"] = _record(compare_bytes(original, derived))
    return out


def environment() -> dict:
    return {
        "python": platform.python_version(),
        "pillow": PIL.__version__,
        "numpy": np.__version__,
        "platform": sys.platform,
        "webp": images.webp_supported(),
    }


def main() -> None:
    payload = {
        "description": (
            "Reproducible metric baselines for synthetic images. Metrics measure visual "
            "similarity only, never protection effectiveness. 'fixture_noise' cases are "
            "measurement fixtures, not protection methods."
        ),
        "size_width_height": list(SIZE),
        "environment": environment(),
        "cases": compute_cases(),
    }
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    BASELINE_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(f"wrote {BASELINE_PATH} with {len(payload['cases'])} cases")


if __name__ == "__main__":
    main()
