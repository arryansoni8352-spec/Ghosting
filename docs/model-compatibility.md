# Model Compatibility — VeilGuard

**Status:** Updated with Milestone 2 Research Integration.

## Overview

This document tracks which AI image-editing systems each VeilGuard algorithm has been tested against or targets theoretically.

> [!WARNING]
> Compatibility is model-specific and version-specific. A perturbation tuned for one model version or architecture may not transfer to another. Always verify the target architecture before relying on protection.

---

## Algorithm × Model Compatibility Matrix

| Algorithm | Method Status | Primary Target Architecture | Tested Models | Licensing & Distribution Status |
|-----------|---------------|------------------------------|---------------|----------------------------------|
| **Baseline Random Noise** | `EXPERIMENTAL` | N/A (Baseline) | None | ✅ Public Domain / MIT (No restrictions) |
| **Neural Feature Disruption (PGD)** | `EXPERIMENTAL` | Multi-scale deep feature representations | ResNet-18 perceptual layers | ✅ BSD 3-Clause (Fully permissive for commercial use) |
| **MIT PhotoGuard (Encoder Attack)** | `BLOCKED` | Latent Diffusion Model VAE (`AutoencoderKL`) | Stable Diffusion v1.4 / v1.5 Inpaint | 🔒 CreativeML Open RAIL-M (Weights blocked pending local user config) |
| **MIT PhotoGuard (Diffusion Attack)** | `BLOCKED` | Full reverse diffusion trajectory (U-Net) | Stable Diffusion v1.4 / v1.5 Inpaint | 🔒 CreativeML Open RAIL-M (Blocked: GPU required, 4GB+ weights) |

---

## Technical Details per Method

### 1. Neural Feature Disruption (PGD)
- **Target:** Deep convolutional perceptual feature embeddings.
- **Objective:** Maximizes $\ell_2$ difference between original and perturbed intermediate feature maps across layers 1, 2, and 3.
- **Feasibility:** Executes on CPU in 1–5 seconds for standard images.
- **Reproducibility:** Seed-controlled RNG across platforms.
- **Commercial Feasibility:** Safe for commercial redistribution; relies entirely on BSD-3 licensed PyTorch torchvision architectures.

### 2. MIT PhotoGuard Encoder Attack
- **Target:** Latent representation $z \in \mathbb{R}^{4 \times \frac{H}{8} \times \frac{W}{8}}$ produced by `AutoencoderKL.encode(x)`.
- **Objective:** Minimizes $\| E(x + \delta) - z_{\text{target}} \|_2^2$ to drive latents toward neutral gray/noise targets.
- **Blockers:**
  - `diffusers` and `transformers` packages not bundled by default.
  - Pre-trained `AutoencoderKL` weights (335 MB) cannot be silently downloaded without user agreement due to privacy rules and CreativeML Open RAIL-M terms.
  - Requires setting `VEILGUARD_SD_VAE_PATH` environment variable.
