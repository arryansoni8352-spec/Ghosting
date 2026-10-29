"""
Unit and integration tests for MIT PhotoGuard Encoder Adapter.
Verifies honest blocker reporting, input validation, deterministic PGD optimization,
CPU memory safety, lossless L-infinity bounds, and failure handling.
"""

from __future__ import annotations

from pathlib import Path
import numpy as np
import pytest
import torch
from diffusers import AutoencoderKL
from PIL import Image

from veilguard_engine.adapters.photoguard import PhotoGuardEncoderAdapter


@pytest.fixture
def lightweight_test_vae() -> AutoencoderKL:
    """Creates a deterministic, lightweight AutoencoderKL instance for CPU unit testing."""
    vae = AutoencoderKL(
        in_channels=3,
        out_channels=3,
        down_block_types=["DownEncoderBlock2D", "DownEncoderBlock2D"],
        up_block_types=["UpDecoderBlock2D", "UpDecoderBlock2D"],
        block_out_channels=[32, 64],
        latent_channels=4,
    )
    vae.eval()
    return vae


def test_photoguard_descriptor_reports_blocker_faithfully(monkeypatch):
    """Verifies that descriptor reports BLOCKED with exact resource requirements when weights are missing."""
    monkeypatch.delenv("VEILGUARD_SD_VAE_PATH", raising=False)
    adapter = PhotoGuardEncoderAdapter()
    desc = adapter.descriptor()

    assert desc["id"] == "photoguard-encoder-attack"
    assert desc["status"] == "BLOCKED"
    assert "Blocked: Stable Diffusion AutoencoderKL weights are not installed locally" in desc["statusReason"]
    assert desc["resourceRequirements"]["downloadSizeMb"] == 335
    assert desc["resourceRequirements"]["peakRamMb"] == 940


def test_photoguard_run_fails_honestly_when_weights_missing(tmp_path: Path, monkeypatch):
    """Verifies that run() refuses to fake protection when model weights are not configured."""
    monkeypatch.delenv("VEILGUARD_SD_VAE_PATH", raising=False)
    adapter = PhotoGuardEncoderAdapter()

    in_file = tmp_path / "test_in.png"
    out_file = tmp_path / "test_out.png"
    Image.fromarray(np.zeros((64, 64, 3), dtype=np.uint8)).save(in_file)

    res = adapter.run(
        input_path=in_file,
        output_path=out_file,
        params={"strength": 8.0},
        device="cpu",
        seed=42,
        timeout_seconds=30,
        progress_callback=lambda p, m: None,
    )

    assert res["status"] == "failure"
    assert res["error"]["code"] == "ALGORITHM_BLOCKED"
    assert not out_file.exists()


def test_photoguard_pgd_execution_and_linf_bound(tmp_path: Path, lightweight_test_vae):
    """Verifies actual PGD optimization, gradient descent step, and post-export L-infinity bound."""
    adapter = PhotoGuardEncoderAdapter()

    in_file = tmp_path / "test_in.png"
    out_file = tmp_path / "test_out.png"

    np.random.seed(42)
    raw = np.random.randint(20, 235, (64, 64, 3), dtype=np.uint8)
    Image.fromarray(raw).save(in_file)

    res = adapter.run(
        input_path=in_file,
        output_path=out_file,
        params={"strength": 8.0, "iterations": 5, "vae_model": lightweight_test_vae},
        device="cpu",
        seed=42,
        timeout_seconds=30,
        progress_callback=lambda p, m: None,
    )

    assert res["status"] == "success"
    assert res["linfGuaranteed"] is True
    assert res["measuredMaxPixelDiff"] <= 8
    assert out_file.exists()

    orig = np.array(Image.open(in_file))
    prot = np.array(Image.open(out_file))
    max_diff = np.max(np.abs(orig.astype(int) - prot.astype(int)))
    assert max_diff <= 8
    assert max_diff > 0  # Must actually perturb the image


def test_photoguard_determinism_with_seed(tmp_path: Path, lightweight_test_vae):
    """Verifies that PGD optimization is strictly deterministic when seed is provided."""
    adapter = PhotoGuardEncoderAdapter()

    in_file = tmp_path / "test_in.png"
    out1 = tmp_path / "out1.png"
    out2 = tmp_path / "out2.png"

    raw = np.random.randint(20, 235, (64, 64, 3), dtype=np.uint8)
    Image.fromarray(raw).save(in_file)

    adapter.run(
        input_path=in_file,
        output_path=out1,
        params={"strength": 8.0, "iterations": 3, "vae_model": lightweight_test_vae},
        device="cpu",
        seed=101,
        timeout_seconds=30,
        progress_callback=lambda p, m: None,
    )

    adapter.run(
        input_path=in_file,
        output_path=out2,
        params={"strength": 8.0, "iterations": 3, "vae_model": lightweight_test_vae},
        device="cpu",
        seed=101,
        timeout_seconds=30,
        progress_callback=lambda p, m: None,
    )

    arr1 = np.array(Image.open(out1))
    arr2 = np.array(Image.open(out2))
    assert np.array_equal(arr1, arr2)


def test_photoguard_dimension_cropping_and_rgba(tmp_path: Path, lightweight_test_vae):
    """Verifies that non-multiple-of-8 dimensions crop cleanly and RGBA alpha is preserved."""
    adapter = PhotoGuardEncoderAdapter()

    in_file = tmp_path / "test_odd.png"
    out_file = tmp_path / "test_odd_out.png"

    # Non-multiple of 8 dimensions (67x75) with RGBA
    arr = np.random.randint(20, 235, (67, 75, 4), dtype=np.uint8)
    Image.fromarray(arr, mode="RGBA").save(in_file)

    res = adapter.run(
        input_path=in_file,
        output_path=out_file,
        params={"strength": 8.0, "iterations": 3, "vae_model": lightweight_test_vae},
        device="cpu",
        seed=42,
        timeout_seconds=30,
        progress_callback=lambda p, m: None,
    )

    assert res["status"] == "success"
    with Image.open(out_file) as im:
        assert im.mode == "RGBA"
        # Dimensions cropped to multiples of 8: (67//8)*8 = 64, (75//8)*8 = 72
        assert im.size == (72, 64)
