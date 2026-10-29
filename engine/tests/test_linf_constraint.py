"""
Regression tests for L-infinity Pixel-Bound Guarantees across formats and edge cases.

Verifies:
1. Strict integer L-infinity bound (<= epsilon) holds for lossless PNG exports.
2. RGBA inputs preserve the alpha channel and satisfy the bound on color channels.
3. Lossy formats (JPEG) explicitly disable the strict pixel-bound guarantee and issue warnings.
4. Saturated pixel boundaries ([0, 255]) do not wrap around or violate bounds.
5. Non-standard / odd dimensions are handled robustly.
"""

from __future__ import annotations
from pathlib import Path
import numpy as np
import pytest
from PIL import Image

from veilguard_engine.adapters.feature_disruption import FeatureDisruptionAdapter


def test_linf_constraint_pre_and_post_export_png(tmp_path: Path) -> None:
    """Verifies that lossless PNG export strictly guarantees max pixel diff <= epsilon."""
    in_file = tmp_path / "test_linf_in.png"
    out_file = tmp_path / "test_linf_out.png"

    np.random.seed(123)
    raw = np.random.randint(0, 256, (128, 128, 3), dtype=np.uint8)
    Image.fromarray(raw).save(in_file)

    strength = 8.0
    adapter = FeatureDisruptionAdapter()

    res = adapter.run(
        input_path=in_file,
        output_path=out_file,
        params={"strength": strength, "iterations": 5},
        device="cpu",
        seed=42,
        timeout_seconds=30,
        progress_callback=lambda p, m: None,
    )
    assert res["status"] == "success"
    assert res["linfGuaranteed"] is True
    assert res["measuredMaxPixelDiff"] <= int(strength)

    orig = np.array(Image.open(in_file))
    prot = np.array(Image.open(out_file))
    max_post_diff = np.max(np.abs(orig.astype(int) - prot.astype(int)))
    assert max_post_diff <= int(strength)


def test_linf_rgba_handling_and_preservation(tmp_path: Path) -> None:
    """Verifies that RGBA images preserve their alpha channel and maintain L-infinity bounds."""
    in_file = tmp_path / "test_linf_in.png"
    out_file = tmp_path / "test_linf_out.png"

    np.random.seed(456)
    rgb = np.random.randint(0, 256, (64, 64, 3), dtype=np.uint8)
    alpha = np.random.randint(50, 255, (64, 64, 1), dtype=np.uint8)
    rgba = np.concatenate([rgb, alpha], axis=-1)
    Image.fromarray(rgba, mode="RGBA").save(in_file)

    adapter = FeatureDisruptionAdapter()
    res = adapter.run(
        input_path=in_file,
        output_path=out_file,
        params={"strength": 8.0, "iterations": 5},
        device="cpu",
        seed=42,
        timeout_seconds=30,
        progress_callback=lambda p, m: None,
    )
    assert res["status"] == "success"
    assert res["linfGuaranteed"] is True

    orig_img = Image.open(in_file)
    prot_img = Image.open(out_file)
    assert prot_img.mode == "RGBA"

    orig_arr = np.array(orig_img)
    prot_arr = np.array(prot_img)

    # Color channels must satisfy L-infinity bound
    rgb_diff = np.max(np.abs(orig_arr[:, :, :3].astype(int) - prot_arr[:, :, :3].astype(int)))
    assert rgb_diff <= 8

    # Alpha channel must be strictly preserved
    alpha_diff = np.max(np.abs(orig_arr[:, :, 3].astype(int) - prot_arr[:, :, 3].astype(int)))
    assert alpha_diff == 0


def test_linf_lossy_jpeg_disables_strict_guarantee(tmp_path: Path) -> None:
    """Verifies that lossy JPEG exports explicitly disable the L-infinity guarantee with warnings."""
    in_file = tmp_path / "test_linf_in.png"
    out_file = tmp_path / "test_linf_out.jpg"

    np.random.seed(789)
    # High-frequency pattern that causes DCT ringing
    raw = np.random.randint(20, 235, (64, 64, 3), dtype=np.uint8)
    Image.fromarray(raw).save(in_file)

    adapter = FeatureDisruptionAdapter()
    res = adapter.run(
        input_path=in_file,
        output_path=out_file,
        params={"strength": 8.0, "iterations": 5, "jpegQuality": 85},
        device="cpu",
        seed=42,
        timeout_seconds=30,
        progress_callback=lambda p, m: None,
    )
    assert res["status"] == "success"
    assert res["linfGuaranteed"] is False
    assert len(res["warnings"]) > 0
    assert "JPEG discrete cosine transform" in res["warnings"][0]
    assert any("Lossy format notice" in notice for notice in res["limitationNotices"])


def test_linf_saturation_boundaries_and_odd_dimensions(tmp_path: Path) -> None:
    """Verifies that extreme pixel values (0 and 255) and odd dimensions do not wrap around."""
    in_file = tmp_path / "test_linf_odd.png"
    out_file = tmp_path / "test_linf_odd_out.png"

    # Extreme pixel values: corners at 0 and 255, non-power-of-two dimensions (67x93)
    raw = np.zeros((67, 93, 3), dtype=np.uint8)
    raw[:30, :40] = 0
    raw[30:, 40:] = 255

    Image.fromarray(raw).save(in_file)

    adapter = FeatureDisruptionAdapter()
    res = adapter.run(
        input_path=in_file,
        output_path=out_file,
        params={"strength": 8.0, "iterations": 5},
        device="cpu",
        seed=42,
        timeout_seconds=30,
        progress_callback=lambda p, m: None,
    )
    assert res["status"] == "success"
    assert res["linfGuaranteed"] is True
    assert res["measuredMaxPixelDiff"] <= 8

    prot = np.array(Image.open(out_file))
    # Values near 0 must not underflow/wrap to 255
    assert prot[:30, :40].max() <= 8
    # Values near 255 must not overflow/wrap to 0
    assert prot[30:, 40:].min() >= 247
