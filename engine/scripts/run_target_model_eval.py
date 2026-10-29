"""
Empirical Target-Model Evaluation Suite.

Evaluates whether adversarial feature disruption interferes with actual AI model representations,
downstream neural semantic interpretations, and editing pipelines:
  - Dataset: 4 distinct synthetic and geometric benchmark images
  - Tasks:
      1. Neural Semantic Interpretation / Feature Map Sabotage
      2. Neural Class Identity Disruption & Confidence Inversion
      3. Transferability & Robustness against image transforms (JPEG 75, Downsampling 75%, Blur)
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any
import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms.functional as TF
from PIL import Image

# Ensure engine package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from veilguard_engine.adapters.feature_disruption import FeatureDisruptionAdapter
from veilguard_engine.quality_metrics import (
    calculate_psnr,
    calculate_ssim,
    apply_transformation,
)


def create_eval_dataset(out_dir: Path) -> list[dict[str, Any]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    dataset = []

    # Case 1: Concentric Rings / Spiral Texture ("coil" domain)
    Y, X = np.ogrid[:256, :256]
    r = np.sqrt((X - 128)**2 + (Y - 128)**2)
    img1 = np.zeros((256, 256, 3), dtype=np.uint8)
    img1[((r // 12) % 2 == 0)] = [220, 180, 50]
    img1[((r // 12) % 2 != 0)] = [50, 100, 200]
    p1 = out_dir / "eval_case_1_coil.png"
    Image.fromarray(img1).save(p1)
    dataset.append({"id": "case_1_coil", "path": p1, "description": "High-contrast concentric geometric rings"})

    # Case 2: Linear Horizontal/Vertical Slats ("window shade" / architectural texture)
    img2 = np.zeros((256, 256, 3), dtype=np.uint8)
    for i in range(256):
        img2[i, :] = [240 if (i // 10) % 2 == 0 else 20] * 3
    p2 = out_dir / "eval_case_2_slats.png"
    Image.fromarray(img2).save(p2)
    dataset.append({"id": "case_2_slats", "path": p2, "description": "Parallel periodic linear bars"})

    # Case 3: Dual Harmonic Gradient Lattice
    x = np.linspace(0, 1, 256)
    y = np.linspace(0, 1, 256)
    xx, yy = np.meshgrid(x, y)
    pat = np.stack([
        np.sin(xx * 14) * 0.5 + 0.5,
        np.cos(yy * 14) * 0.5 + 0.5,
        (xx + yy) * 0.5
    ], axis=-1)
    img3 = (pat * 255).astype(np.uint8)
    p3 = out_dir / "eval_case_3_harmonic.png"
    Image.fromarray(img3).save(p3)
    dataset.append({"id": "case_3_harmonic", "path": p3, "description": "Continuous multi-channel harmonic wave lattice"})

    # Case 4: Checkerboard High-Frequency Tile
    img4 = np.zeros((256, 256, 3), dtype=np.uint8)
    img4[((X // 16 + Y // 16) % 2 == 0)] = [230, 230, 230]
    img4[((X // 16 + Y // 16) % 2 != 0)] = [40, 40, 40]
    p4 = out_dir / "eval_case_4_checkerboard.png"
    Image.fromarray(img4).save(p4)
    dataset.append({"id": "case_4_checkerboard", "path": p4, "description": "Periodic high-frequency checkerboard matrix"})

    return dataset


def run_target_model_eval(out_dir: Path) -> dict[str, Any]:
    dataset = create_eval_dataset(out_dir)
    adapter = FeatureDisruptionAdapter()

    # Load real target model: ResNet-18 vision backbone
    weights = models.ResNet18_Weights.DEFAULT
    target_model = models.resnet18(weights=weights).eval()
    categories = weights.meta["categories"]

    def extract_conv_features(t: torch.Tensor) -> list[torch.Tensor]:
        mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
        norm_t = (t - mean) / std
        f1 = target_model.maxpool(target_model.relu(target_model.bn1(target_model.conv1(norm_t))))
        f2 = target_model.layer1(f1)
        f3 = target_model.layer2(f2)
        f4 = target_model.layer3(f3)
        return [f1, f2, f3, f4]

    eval_report: dict[str, Any] = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "target_model": {
            "name": "ResNet-18",
            "weights": "ResNet18_Weights.DEFAULT (IMAGENET1K_V1)",
            "license": "BSD-3-Clause",
            "device": "cpu",
        },
        "per_case_results": [],
        "transformation_transfers": [],
        "aggregate_summary": {},
    }

    class_disruptions = 0
    total_feature_dist = 0.0

    for item in dataset:
        case_id = item["id"]
        in_path = item["path"]
        prot_path = out_dir / f"{case_id}_protected.png"

        # Apply protection
        t0 = time.perf_counter()
        res = adapter.run(
            input_path=in_path,
            output_path=prot_path,
            params={"strength": 8.0, "iterations": 5},
            device="cpu",
            seed=42,
            timeout_seconds=30,
            progress_callback=lambda p, m: None,
        )
        duration = round(time.perf_counter() - t0, 3)

        # Image analysis
        orig_img = Image.open(in_path)
        prot_img = Image.open(prot_path)
        orig_arr = np.array(orig_img)
        prot_arr = np.array(prot_img)

        psnr_val = round(calculate_psnr(orig_arr, prot_arr), 2)
        ssim_val = round(calculate_ssim(orig_arr, prot_arr), 4)
        max_diff = int(np.max(np.abs(orig_arr.astype(int) - prot_arr.astype(int))))

        # Target Model Inference
        t_clean = TF.normalize(TF.to_tensor(orig_img.resize((224, 224))), mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]).unsqueeze(0)
        t_prot = TF.normalize(TF.to_tensor(prot_img.resize((224, 224))), mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]).unsqueeze(0)

        with torch.no_grad():
            clean_out = torch.softmax(target_model(t_clean), dim=1)
            prot_out = torch.softmax(target_model(t_prot), dim=1)

            c_top = torch.topk(clean_out, 1)
            p_top = torch.topk(prot_out, 1)

            clean_class_id = int(c_top.indices.item())
            clean_class_name = categories[clean_class_id]
            clean_conf = round(float(c_top.values.item()), 4)

            prot_class_id = int(p_top.indices.item())
            prot_class_name = categories[prot_class_id]
            prot_conf = round(float(p_top.values.item()), 4)

            # Feature layer disruption
            feats_clean = extract_conv_features(TF.to_tensor(orig_img).unsqueeze(0))
            feats_prot = extract_conv_features(TF.to_tensor(prot_img).unsqueeze(0))

            layer_dist = [
                round(float(torch.mean((fc - fp)**2).item()), 6)
                for fc, fp in zip(feats_clean, feats_prot)
            ]
            rel_disruption_l3 = round(float(layer_dist[2] / (torch.mean(feats_clean[2]**2).item() + 1e-8) * 100), 2)

        is_flipped = clean_class_id != prot_class_id
        if is_flipped:
            class_disruptions += 1
        total_feature_dist += rel_disruption_l3

        case_res = {
            "case_id": case_id,
            "description": item["description"],
            "quality": {
                "psnr_db": psnr_val,
                "ssim": ssim_val,
                "max_diff_uint8": max_diff,
            },
            "clean_prediction": {
                "class_id": clean_class_id,
                "class_name": clean_class_name,
                "confidence": clean_conf,
            },
            "protected_prediction": {
                "class_id": prot_class_id,
                "class_name": prot_class_name,
                "confidence": prot_conf,
            },
            "target_model_effect": {
                "semantic_class_flipped": is_flipped,
                "relative_feature_disruption_layer3_pct": rel_disruption_l3,
                "layer_mse_distances": layer_dist,
            },
            "duration_seconds": duration,
        }
        eval_report["per_case_results"].append(case_res)

        # Transformation tests for Case 1
        if case_id == "case_1_coil":
            t_transforms = [
                ("jpeg_q75", "jpeg_compression", {"quality": 75}),
                ("downsample_75pct", "resize_resample", {"factor": 0.75}),
                ("gaussian_blur_r1", "gaussian_blur", {"radius": 1.0}),
            ]
            for t_name, t_method, t_kw in t_transforms:
                transformed_img = apply_transformation(prot_img, t_method, **t_kw)
                t_t = TF.normalize(TF.to_tensor(transformed_img.resize((224, 224))), mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]).unsqueeze(0)
                with torch.no_grad():
                    t_probs = torch.softmax(target_model(t_t), dim=1)
                    t_top = torch.topk(t_probs, 1)
                    t_cid = int(t_top.indices.item())
                    eval_report["transformation_transfers"].append({
                        "case_id": case_id,
                        "transform": t_name,
                        "class_id": t_cid,
                        "class_name": categories[t_cid],
                        "confidence": round(float(t_top.values.item()), 4),
                        "still_disrupted": t_cid != clean_class_id,
                    })

    # Summary
    n = len(dataset)
    eval_report["aggregate_summary"] = {
        "cases_evaluated": n,
        "class_flip_rate_pct": round((class_disruptions / n) * 100, 1),
        "mean_relative_feature_disruption_pct": round(total_feature_dist / n, 2),
        "mean_psnr_db": round(float(np.mean([c["quality"]["psnr_db"] for c in eval_report["per_case_results"]])), 2),
        "mean_ssim": round(float(np.mean([c["quality"]["ssim"] for c in eval_report["per_case_results"]])), 4),
        "all_linf_compliant": all(c["quality"]["max_diff_uint8"] <= 8 for c in eval_report["per_case_results"]),
    }

    report_path = out_dir / "target_model_eval_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(eval_report, f, indent=2)

    return eval_report


if __name__ == "__main__":
    out_dir = Path(__file__).parent / "target_model_output"
    rep = run_target_model_eval(out_dir)
    print(json.dumps(rep, indent=2))
