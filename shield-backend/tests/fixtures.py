"""Test-only helpers.

`fixed_noise_fixture` adds seeded uniform noise. It is a MEASUREMENT FIXTURE for checking that
the metrics respond correctly. It is NOT a protection method and must never be imported by app/.
"""
import numpy as np


def fixed_noise_fixture(img: np.ndarray, amplitude: int, seed: int = 1234) -> np.ndarray:
    rng = np.random.default_rng(seed)
    noise = rng.integers(-amplitude, amplitude + 1, size=img.shape)
    return np.clip(img.astype(np.int64) + noise, 0, 255).astype(np.uint8)


def constant_offset(img: np.ndarray, delta: int) -> np.ndarray:
    return np.clip(img.astype(np.int64) + delta, 0, 255).astype(np.uint8)
