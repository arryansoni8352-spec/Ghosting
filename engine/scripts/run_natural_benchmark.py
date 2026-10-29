"""
Natural Image Benchmark Runner for VeilGuard.

Executes controlled empirical evaluations on natural photographic images from the
local dataset manifest.

Evaluates:
1. Feature Disruption representation transfer (ResNet-18 ImageNet backbone).
2. Diffusion SDEdit reverse trajectory dynamics (google/ddpm-cifar10-32, 20 DDIM steps).
3. Matched-pair transformation testing (Gaussian blur, downsampling, JPEG Q75).
4. Strict baseline variability separation.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any
import numpy as np
import psutil
import torch
import torchvision.models as models
import torchvision.transforms.functional as TF
from diffusers import DDIMScheduler, UNet2DModel
from PIL import Image

# Ensure engine package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from veilguard_engine.adapters.feature_disruption import FeatureDisruptionAdapter
from veilguard_engine.natural_dataset import NaturalDatasetManager
from veilguard_engine.quality_metrics import (
    apply_transformation,
    calculate_psnr,
    calculate_ssim,
)
from scripts.run_diffusion_eval import sdedit_step


def run_natural_benchmark(out_dir: Path) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    dataset_manager = NaturalDatasetManager()
    dataset_manager.populate_reference_benchmark_samples()
    images = dataset_manager.list_images()

    adapter = FeatureDisruptionAdapter()

    # Models:
    # 1. ResNet-18 (BSD-3-Clause)
    weights = models.ResNet18_Weights.DEFAULT
    resnet_model = models.resnet18(weights=weights).eval()
    categories = weights.meta["categories"]

    # 2. Diffusion SDEdit Model (Apache-2.0)
    diff_model_id = "google/ddpm-cifar10-32"
    diff_model = UNet2DModel.from_pretrained(diff_model_id, local_files_only=True).eval()
    diff_scheduler = DDIMScheduler.from_pretrained(diff_model_id, local_files_only=True)

    report: dict[str, Any] = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dataset_manifest_summary": {
            "total_natural_images": len(images),
            "images": [
                {
                    "id": img["image_id"],
                    "source": img["source"],
                    "license": img["license"],
                    "target_resolution": img["target_resolution"],
                }
                for img in images
            ],
        },
        "models_evaluated": {
            "representation_model": "ResNet-18 (PyTorch Torchvision, BSD-3-Clause)",
            "diffusion_model": "google/ddpm-cifar10-32 (UNet2D, Apache-2.0, SDEdit DDIM 20-step)",
        },
        "natural_image_evaluations": [],
        "controlled_transformation_evaluations": [],
        "aggregate_summary": {},
    }

    all_dtds = []
    all_tssims = []
    class_flips = 0

    for record in images:
        image_id = record["image_id"]
        img_path = dataset_manager.get_image_path(image_id)
        if not img_path or not img_path.exists():
            continue

        prot_path = out_dir / f"{image_id}_protected.png"

        # Apply Feature Disruption Protection (Lossless PNG)
        t0 = time.perf_counter()
        res = adapter.run(
            input_path=img_path,
            output_path=prot_path,
            params={"strength": 8.0, "iterations": 5},
            device="cpu",
            seed=42,
            timeout_seconds=30,
            progress_callback=lambda p, m: None,
        )
        prot_dur = round(time.perf_counter() - t0, 3)

        orig_pil = Image.open(img_path).convert("RGB")
        prot_pil = Image.open(prot_path).convert("RGB")
        orig_np = np.array(orig_pil)
        prot_np = np.array(prot_pil)

        psnr_val = round(calculate_psnr(orig_np, prot_np), 2)
        ssim_val = round(calculate_ssim(orig_np, prot_np), 4)
        max_diff = int(np.max(np.abs(orig_np.astype(int) - prot_np.astype(int))))
        input_mse = float(np.mean((orig_np.astype(float) - prot_np.astype(float)) ** 2))

        # Track A: ResNet-18 Classification Transfer
        t_clean_224 = TF.normalize(TF.to_tensor(orig_pil.resize((224, 224))), mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]).unsqueeze(0)
        t_prot_224 = TF.normalize(TF.to_tensor(prot_pil.resize((224, 224))), mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]).unsqueeze(0)

        with torch.no_grad():
            clean_probs = torch.softmax(resnet_model(t_clean_224), dim=1)
            prot_probs = torch.softmax(resnet_model(t_prot_224), dim=1)
            c_top = torch.topk(clean_probs, 1)
            p_top = torch.topk(prot_probs, 1)
            c_id = int(c_top.indices.item())
            p_id = int(p_top.indices.item())
            c_name = categories[c_id]
            p_name = categories[p_id]
            is_flipped = c_id != p_id
            if is_flipped:
                class_flips += 1

        # Track B: SDEdit Diffusion Trajectory (at 32x32)
        orig_32 = orig_pil.resize((32, 32), Image.Resampling.LANCZOS)
        prot_32 = prot_pil.resize((32, 32), Image.Resampling.LANCZOS)
        t_clean_32 = (torch.tensor(np.array(orig_32), dtype=torch.float32).permute(2, 0, 1).unsqueeze(0) / 127.5) - 1.0
        t_prot_32 = (torch.tensor(np.array(prot_32), dtype=torch.float32).permute(2, 0, 1).unsqueeze(0) / 127.5) - 1.0

        diff_runs = []
        for s in [0.25, 0.50, 0.75]:
            for seed in [42, 101]:
                ec = sdedit_step(diff_model, diff_scheduler, t_clean_32, noise_strength=s, seed=seed)
                ep = sdedit_step(diff_model, diff_scheduler, t_prot_32, noise_strength=s, seed=seed)

                ec_np = (ec.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).round().astype(np.uint8)
                ep_np = (ep.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).round().astype(np.uint8)

                dtd_mse = round(float(np.mean((ec_np.astype(float) - ep_np.astype(float)) ** 2)), 3)
                t_ssim = round(calculate_ssim(ec_np, ep_np), 4)

                all_dtds.append(dtd_mse)
                all_tssims.append(t_ssim)

                diff_runs.append({
                    "noise_strength": s,
                    "seed": seed,
                    "trajectory_drift_mse_255": dtd_mse,
                    "trajectory_ssim": t_ssim,
                    "edit_diverged": dtd_mse > 5.0,
                })

        case_entry = {
            "image_id": image_id,
            "source": record["source"],
            "license": record["license"],
            "quality": {
                "psnr_db": psnr_val,
                "ssim": ssim_val,
                "max_diff_uint8": max_diff,
                "input_mse_255": round(input_mse, 3),
                "linf_compliant": max_diff <= 8,
            },
            "resnet18_classification": {
                "clean_prediction": {"id": c_id, "name": c_name, "conf": round(float(c_top.values.item()), 4)},
                "protected_prediction": {"id": p_id, "name": p_name, "conf": round(float(p_top.values.item()), 4)},
                "semantic_class_flipped": is_flipped,
            },
            "diffusion_sdedit_runs": diff_runs,
        }
        report["natural_image_evaluations"].append(case_entry)

        # Transformation tests on the first natural image
        if image_id == images[0]["image_id"]:
            trans_list = [
                ("jpeg_q75", "jpeg_compression", {"quality": 75}),
                ("gaussian_blur_r1", "gaussian_blur", {"radius": 1.0}),
                ("downsample_75pct", "resize_resample", {"factor": 0.75}),
            ]
            baseline_s50_run = next(r for r in diff_runs if r["noise_strength"] == 0.50 and r["seed"] == 42)
            base_drift = baseline_s50_run["trajectory_drift_mse_255"]

            for t_name, t_method, t_kw in trans_list:
                tc = apply_transformation(orig_32, t_method, **t_kw)
                tp = apply_transformation(prot_32, t_method, **t_kw)

                tc_t = (torch.tensor(np.array(tc), dtype=torch.float32).permute(2, 0, 1).unsqueeze(0) / 127.5) - 1.0
                tp_t = (torch.tensor(np.array(tp), dtype=torch.float32).permute(2, 0, 1).unsqueeze(0) / 127.5) - 1.0

                etc = sdedit_step(diff_model, diff_scheduler, tc_t, noise_strength=0.50, seed=42)
                etp = sdedit_step(diff_model, diff_scheduler, tp_t, noise_strength=0.50, seed=42)

                etc_np = (etc.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).round().astype(np.uint8)
                etp_np = (etp.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).round().astype(np.uint8)

                t_drift = round(float(np.mean((etc_np.astype(float) - etp_np.astype(float)) ** 2)), 3)
                t_ssim = round(calculate_ssim(etc_np, etp_np), 4)

                report["controlled_transformation_evaluations"].append({
                    "image_id": image_id,
                    "transformation": t_name,
                    "noise_strength": 0.50,
                    "seed": 42,
                    "baseline_drift_mse": base_drift,
                    "transformed_paired_drift_mse": t_drift,
                    "transformed_paired_ssim": t_ssim,
                    "protection_survives": t_drift > 5.0 and (t_drift / (base_drift + 1e-8)) > 0.25,
                })

    n_images = len(report["natural_image_evaluations"])
    report["aggregate_summary"] = {
        "natural_images_tested": n_images,
        "classification_flip_rate_pct": round((class_flips / (n_images or 1)) * 100, 1),
        "mean_diffusion_drift_mse_255": round(float(np.mean(all_dtds)), 3) if all_dtds else 0.0,
        "mean_diffusion_ssim": round(float(np.mean(all_tssims)), 4) if all_tssims else 1.0,
        "all_lossless_linf_compliant": all(c["quality"]["linf_compliant"] for c in report["natural_image_evaluations"]),
    }

    report_file = out_dir / "natural_benchmark_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    return report


if __name__ == "__main__":
    out_target = Path(__file__).parent / "natural_benchmark_output"
    rep = run_natural_benchmark(out_target)
    print("\n=== NATURAL IMAGE BENCHMARK COMPLETE ===")
    print(json.dumps(rep["aggregate_summary"], indent=2))
    print(f"Report written to: {out_target / 'natural_benchmark_report.json'}")
