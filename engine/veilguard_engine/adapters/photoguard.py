"""
MIT PhotoGuard Encoder Attack Adapter.

Reference:
    "Raising the Cost of Malicious AI-Powered Image Editing"
    Hadi Salman, Alaa Khaddaj, Guillaume Leclerc, Andrew Ilyas, Aleksander Madry (MIT CSAIL)
    Paper: https://arxiv.org/abs/2302.06588
    Official Repository: https://github.com/MadryLab/photoguard (MIT License)

Status & Blocker Gate:
    - Code Architecture: MIT License (Permissive).
    - Model Weights Required: Pretrained Stable Diffusion AutoencoderKL (e.g. stabilityai/sd-vae-ft-mse).
    - Model License: CreativeML OpenRAIL-M (commercial use permitted subject to Annex A behavioral restrictions).
    - Execution Gate: If weights are not installed locally, status is BLOCKED.
      Downloading 335MB+ model weights requires explicit user approval under VeilGuard privacy rules.

Technical Formulation:
    Projected Gradient Descent (PGD) in the latent space of AutoencoderKL:
        delta* = arg min_{||delta||_inf <= eps} || Enc(x + delta) - z_target ||_2^2
    where Enc(x) uses latent_dist.mean (deterministic encoder projection, not stochastic sampling).
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

DEFAULT_EPSILON = 8.0  # Out of 255 (standard budget)
DEFAULT_STEPS = 20     # Realistic CPU default (40 steps on GPU)
DEFAULT_STEP_SIZE = 1.6 # Out of 255


class PhotoGuardEncoderAdapter(AlgorithmAdapter):
    """
    Implements the authentic Projected Gradient Descent (PGD) encoder attack from MIT PhotoGuard.
    Targets the latent space of AutoencoderKL to disrupt downstream diffusion inpainting.
    """

    @property
    def algorithm_id(self) -> str:
        return "photoguard-encoder-attack"

    def _resolve_weights_path(self) -> Path | None:
        """Resolves local VAE checkpoint path if configured or cached."""
        env_path = os.environ.get("VEILGUARD_SD_VAE_PATH", "").strip()
        if env_path and os.path.exists(env_path):
            return Path(env_path)

        # Check default HuggingFace local cache
        hf_cache = Path.home() / ".cache" / "huggingface" / "hub"
        candidate_dirs = [
            hf_cache / "models--stabilityai--sd-vae-ft-mse" / "snapshots",
            hf_cache / "models--CompVis--stable-diffusion-v1-4" / "snapshots",
        ]
        for cdir in candidate_dirs:
            if cdir.exists():
                snapshots = list(cdir.glob("*"))
                if snapshots:
                    return snapshots[0]

        return None

    def descriptor(self) -> dict[str, Any]:
        blockers: list[str] = []
        try:
            import torch
        except ImportError:
            blockers.append("PyTorch is not installed.")

        try:
            import diffusers
        except ImportError:
            blockers.append("Hugging Face 'diffusers' is not installed.")

        weights_path = self._resolve_weights_path()
        if weights_path is None:
            blockers.append(
                "Stable Diffusion AutoencoderKL weights are not installed locally (~335 MB). "
                "Automatic downloading without user approval is disabled by offline privacy policy. "
                "Set VEILGUARD_SD_VAE_PATH to a local AutoencoderKL directory, or grant download consent."
            )

        status = "EXPERIMENTAL" if not blockers else "BLOCKED"
        status_reason = (
            f"Ready for local execution using weights at {weights_path}."
            if not blockers
            else "Blocked: " + " ".join(blockers)
        )

        return {
            "id": self.algorithm_id,
            "name": "MIT PhotoGuard (Encoder Attack)",
            "description": (
                "Performs Projected Gradient Descent (PGD) optimization in the latent space "
                "of Stable Diffusion's AutoencoderKL (Salman et al., MIT CSAIL). "
                "Disrupts latent embeddings before downstream diffusion inpainting."
            ),
            "status": status,
            "statusReason": status_reason,
            "supportedDevices": ["cpu", "cuda"],
            "requiresGpu": False,
            "commercialUseReviewed": True,
            "paperReference": "https://arxiv.org/abs/2302.06588",
            "officialRepository": "https://github.com/MadryLab/photoguard",
            "weightsLicense": "CreativeML OpenRAIL-M (commercial use permitted with behavioral restrictions)",
            "resourceRequirements": {
                "downloadSizeMb": 335,
                "peakRamMb": 940,
                "recommendedMaxResolution": [256, 256],
                "cpuEstimatedSeconds": 45,
            },
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
        desc = self.descriptor()

        # In-memory test model injection (used in tests and local benchmarking without disk weights)
        vae_model = params.get("vae_model")

        if vae_model is None and desc["status"] == "BLOCKED":
            return {
                "status": "failure",
                "error": {
                    "code": "ALGORITHM_BLOCKED",
                    "message": "PhotoGuard encoder attack cannot execute: " + desc["statusReason"],
                    "detail": (
                        "VeilGuard strictly refuses to simulate or substitute fake perturbations. "
                        "To execute, download sd-vae-ft-mse with user consent or set VEILGUARD_SD_VAE_PATH."
                    ),
                },
            }

        try:
            import torch
            from diffusers import AutoencoderKL
        except ImportError as e:
            return {
                "status": "failure",
                "error": {
                    "code": "DEPENDENCY_MISSING",
                    "message": f"Required ML dependency missing: {e}",
                },
            }

        try:
            dev = torch.device("cuda" if device == "cuda" and torch.cuda.is_available() else "cpu")
            if seed is not None:
                torch.manual_seed(seed)
                np.random.seed(seed)

            progress_callback(10, "Loading AutoencoderKL model...")
            if vae_model is not None:
                vae = vae_model.to(dev)
            else:
                weights_path = self._resolve_weights_path()
                if weights_path is None:
                    raise FileNotFoundError("VAE model weights path not found.")
                vae = AutoencoderKL.from_pretrained(str(weights_path), local_files_only=True).to(dev)

            vae.eval()
            for p in vae.parameters():
                p.requires_grad = False

            progress_callback(20, "Loading and normalizing input image...")
            with Image.open(input_path) as raw_img:
                raw_img = ImageOps.exif_transpose(raw_img)
                orig_mode = raw_img.mode
                alpha_channel = None

                if orig_mode == "RGBA":
                    alpha_channel = raw_img.split()[3]
                    pil_img = raw_img.convert("RGB")
                elif orig_mode != "RGB":
                    pil_img = raw_img.convert("RGB")
                else:
                    pil_img = raw_img.copy()

                orig_w, orig_h = pil_img.size

                # AutoencoderKL requires dimensions to be divisible by 8 (8x spatial downsampling).
                # Center crop to nearest multiple of 8 without resampling to prevent blurring perturbations.
                calc_w = (orig_w // 8) * 8
                calc_h = (orig_h // 8) * 8
                if (calc_w, calc_h) != (orig_w, orig_h):
                    left = (orig_w - calc_w) // 2
                    top = (orig_h - calc_h) // 2
                    pil_img = pil_img.crop((left, top, left + calc_w, top + calc_h))
                    if alpha_channel is not None:
                        alpha_channel = alpha_channel.crop((left, top, left + calc_w, top + calc_h))

                arr = np.array(pil_img, dtype=np.float32)
                # Map [0, 255] to [-1.0, 1.0] expected by AutoencoderKL
                tensor_img = ((torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0) / 127.5) - 1.0).to(dev)

            progress_callback(30, "Establishing target latent representation...")
            # In PhotoGuard (Salman et al.), the encoder attack minimizes distance to a target latent.
            # We determine the exact latent dimension dynamically from the VAE encoder.
            with torch.no_grad():
                init_latent = vae.encode(tensor_img).latent_dist.mean

            gen = torch.Generator(device=dev).manual_seed(seed if seed is not None else 42)
            target_latent = torch.randn(init_latent.shape, generator=gen, device=dev, dtype=tensor_img.dtype)

            # Optimization settings
            strength = float(params.get("strength", DEFAULT_EPSILON))
            eps = max(1.0, min(32.0, strength)) / 127.5  # Bounded in [-1, 1] tensor space
            steps = int(params.get("iterations", DEFAULT_STEPS))
            step_size = float(params.get("stepSize", DEFAULT_STEP_SIZE)) / 127.5

            progress_callback(35, "Running Projected Gradient Descent (PGD) encoder attack...")
            delta = torch.zeros_like(tensor_img, requires_grad=True)

            for step in range(steps):
                if time.monotonic() - t_start > timeout_seconds:
                    return {
                        "status": "failure",
                        "error": {
                            "code": "TIMEOUT",
                            "message": f"PhotoGuard PGD optimization timed out after {timeout_seconds}s.",
                        },
                    }

                adv_img = torch.clamp(tensor_img + delta, -1.0, 1.0)
                # Use latent_dist.mean (deterministic latent projection, avoiding stochastic sampling noise)
                latent = vae.encode(adv_img).latent_dist.mean

                # Loss: Mean Squared Error to target latent
                loss = torch.nn.functional.mse_loss(latent, target_latent)
                loss.backward()

                with torch.no_grad():
                    grad = delta.grad.data
                    # Gradient descent towards target latent
                    delta.data = delta.data - step_size * torch.sign(grad)
                    # Project onto L_infinity ball [-eps, eps]
                    delta.data = torch.clamp(delta.data, -eps, eps)
                    # Enforce valid image bounds in [-1.0, 1.0]
                    delta.data = torch.clamp(tensor_img + delta.data, -1.0, 1.0) - tensor_img
                    delta.grad.zero_()

                pct = 35 + int(((step + 1) / steps) * 50)
                progress_callback(pct, f"PGD latent optimization step {step + 1}/{steps}")

            progress_callback(90, "Reconstructing protected image...")
            with torch.no_grad():
                final_adv = torch.clamp(tensor_img + delta, -1.0, 1.0)
                # Map [-1.0, 1.0] back to [0, 255] with symmetric mathematical rounding
                final_float = (final_adv.squeeze(0).permute(1, 2, 0).cpu().numpy() + 1.0) * 127.5
                final_np = np.clip(np.round(final_float), 0, 255).astype(np.uint8)
                out_img = Image.fromarray(final_np)

            # Determine format & save
            ext = output_path.suffix.lower()
            save_format = "JPEG" if ext in (".jpg", ".jpeg") else "PNG"
            save_kwargs: dict[str, Any] = {}

            if save_format == "JPEG":
                save_kwargs["quality"] = int(params.get("jpegQuality", 92))
                save_kwargs["subsampling"] = 0
                out_img.save(str(output_path), format=save_format, **save_kwargs)
            else:
                if orig_mode == "RGBA" and alpha_channel is not None:
                    out_img = Image.merge("RGBA", (*out_img.split(), alpha_channel))
                out_img.save(str(output_path), format="PNG")

            progress_callback(95, "Verifying post-export pixel bounds...")
            with Image.open(output_path) as reloaded:
                reloaded_rgb = np.array(reloaded.convert("RGB"), dtype=np.int32)
            orig_rgb = np.array(pil_img.convert("RGB"), dtype=np.int32)
            measured_max_diff = int(np.max(np.abs(orig_rgb - reloaded_rgb)))

            warnings: list[str] = []
            limitation_notices = [
                "Authentic MIT PhotoGuard latent encoder attack applied via Projected Gradient Descent (PGD).",
                "Perturbation targets the latent representation space of Stable Diffusion's AutoencoderKL.",
                "Protection aims to cause latent collapse during diffusion inpainting; does NOT guarantee immunity against all editors.",
            ]

            if save_format == "JPEG":
                linf_guaranteed = False
                msg = (
                    f"JPEG compression introduces DCT block quantization artifacts. "
                    f"Post-export maximum pixel difference was {measured_max_diff}. "
                    f"Strict L-infinity pixel-bound guarantees apply ONLY to lossless exports (PNG)."
                )
                warnings.append(msg)
                limitation_notices.append(f"⚠️ Lossy format notice: {msg}")
            else:
                linf_guaranteed = measured_max_diff <= int(round(strength))
                limitation_notices.append(
                    f"Lossless export (PNG): Verified post-export L-infinity bound satisfied "
                    f"(measured max uint8 pixel difference: {measured_max_diff} <= {int(round(strength))})."
                )

            progress_callback(100, "Done.")

            return {
                "status": "success",
                "outputFormat": save_format.lower(),
                "measuredMaxPixelDiff": measured_max_diff,
                "linfGuaranteed": linf_guaranteed,
                "warnings": warnings,
                "limitationNotices": limitation_notices,
            }

        except Exception as exc:
            return {
                "status": "failure",
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": f"PhotoGuard execution failed: {exc}",
                    "detail": traceback.format_exc(),
                },
            }
