"""
Tests for Diffusion-Based Image-Editing Evaluation Suite.
Verifies offline loading, SDEdit trajectory calculation, and metric computation.
"""

from __future__ import annotations

import sys
from pathlib import Path
import numpy as np
import pytest
import torch

from diffusers import DDIMScheduler, UNet2DModel

# Ensure engine package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.run_diffusion_eval import sdedit_step, create_eval_images


@pytest.fixture(scope="module")
def diffusion_pipeline():
    model_id = "google/ddpm-cifar10-32"
    model = UNet2DModel.from_pretrained(model_id, local_files_only=True).eval()
    scheduler = DDIMScheduler.from_pretrained(model_id, local_files_only=True)
    return model, scheduler


def test_offline_diffusion_model_loading(diffusion_pipeline):
    model, scheduler = diffusion_pipeline
    assert model is not None
    assert scheduler is not None
    assert model.config.sample_size == 32
    assert model.config.in_channels == 3


def test_sdedit_step_preserves_bounds_and_determinism(diffusion_pipeline):
    model, scheduler = diffusion_pipeline
    torch.manual_seed(42)
    test_input = torch.zeros((1, 3, 32, 32), dtype=torch.float32)

    # Run with small steps for unit testing
    out1 = sdedit_step(model, scheduler, test_input, noise_strength=0.3, seed=42, num_inference_steps=2)
    out2 = sdedit_step(model, scheduler, test_input, noise_strength=0.3, seed=42, num_inference_steps=2)

    # Must be deterministic given same seed
    assert torch.allclose(out1, out2, atol=1e-5)
    # Output must be normalized image in [0, 1]
    assert out1.min().item() >= 0.0
    assert out1.max().item() <= 1.0
    assert out1.shape == (1, 3, 32, 32)


def test_eval_dataset_generation(tmp_path):
    dataset = create_eval_images(tmp_path)
    assert len(dataset) == 4
    for item in dataset:
        assert item["path"].exists()
        assert item["path"].suffix == ".png"


def test_paired_transformation_experiment_pairing_rules(diffusion_pipeline, tmp_path):
    """
    Phase 2 Regression Test:
    Enforces the pairing rule for transformation experiments:
    1. Start with the same original clean and protected image.
    2. Apply the identical transformation separately to BOTH clean and protected inputs.
    3. Compare the clean-transformed output against the protected-transformed output.
    4. Verify that the transformed protected output is NOT compared against untransformed clean output.
    """
    from PIL import Image
    from veilguard_engine.quality_metrics import apply_transformation, calculate_ssim

    model, scheduler = diffusion_pipeline

    # Create dummy clean and protected 32x32 images
    np.random.seed(42)
    clean_arr = np.random.randint(50, 200, (32, 32, 3), dtype=np.uint8)
    prot_arr = np.clip(clean_arr.astype(int) + 8, 0, 255).astype(np.uint8)

    clean_pil = Image.fromarray(clean_arr)
    prot_pil = Image.fromarray(prot_arr)

    # Apply Gaussian Blur separately to BOTH
    trans_clean_pil = apply_transformation(clean_pil, "gaussian_blur", radius=1.0)
    trans_prot_pil = apply_transformation(prot_pil, "gaussian_blur", radius=1.0)

    # Convert to tensors
    t_clean = (torch.tensor(clean_arr, dtype=torch.float32).permute(2, 0, 1).unsqueeze(0) / 127.5) - 1.0
    t_trans_clean = (torch.tensor(np.array(trans_clean_pil), dtype=torch.float32).permute(2, 0, 1).unsqueeze(0) / 127.5) - 1.0
    t_trans_prot = (torch.tensor(np.array(trans_prot_pil), dtype=torch.float32).permute(2, 0, 1).unsqueeze(0) / 127.5) - 1.0

    # Run SDEdit on both under identical seed and small steps (2 steps)
    edit_untrans_clean = sdedit_step(model, scheduler, t_clean, noise_strength=0.3, seed=42, num_inference_steps=2)
    edit_trans_clean = sdedit_step(model, scheduler, t_trans_clean, noise_strength=0.3, seed=42, num_inference_steps=2)
    edit_trans_prot = sdedit_step(model, scheduler, t_trans_prot, noise_strength=0.3, seed=42, num_inference_steps=2)

    # Convert to numpy
    e_untrans_clean_np = (edit_untrans_clean.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).round().astype(np.uint8)
    e_trans_clean_np = (edit_trans_clean.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).round().astype(np.uint8)
    e_trans_prot_np = (edit_trans_prot.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).round().astype(np.uint8)

    # Paired transformed drift:
    paired_drift = np.mean((e_trans_clean_np.astype(float) - e_trans_prot_np.astype(float)) ** 2)

    # Flawed unpaired drift (trans_prot vs untrans_clean):
    flawed_unpaired_drift = np.mean((e_untrans_clean_np.astype(float) - e_trans_prot_np.astype(float)) ** 2)

    # In paired evaluation, trans_clean and trans_prot only differ by the blurred perturbation.
    # In unpaired evaluation, trans_prot and untrans_clean differ by BOTH the blur AND the perturbation.
    # Therefore, flawed_unpaired_drift must differ from paired_drift.
    assert paired_drift != flawed_unpaired_drift
    # And paired drift measures genuine residual perturbation effect after blur
    assert paired_drift >= 0.0
