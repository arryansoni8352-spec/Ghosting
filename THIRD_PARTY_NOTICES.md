# VeilGuard — Third-Party Notices & Licenses

VeilGuard incorporates open-source software, libraries, and machine-learning assets. This document outlines the relevant licenses, notices, and attribution details.

---

## 1. Application & Frontend Dependencies

| Package | License | Description / Purpose |
|---|---|---|
| **Electron** | MIT License | Desktop application shell |
| **React & React-DOM** | MIT License | User interface framework |
| **Vite** | MIT License | Frontend build tool |
| **Vitest** | MIT License | Desktop and IPC unit test runner |
| **TypeScript** | Apache-2.0 | Type checking and language compilation |
| **UUID** | MIT License | Deterministic request tracking IDs |

---

## 2. Python Engine & Machine Learning Dependencies

| Library | License | Description / Purpose |
|---|---|---|
| **PyTorch (`torch`)** | Modified BSD-3 | Tensor math and automatic differentiation |
| **Torchvision** | BSD-3-Clause | Reference convolutional architectures and weights |
| **Pillow (`PIL`)** | HPND License | Image decoding, metadata, and format serialization |
| **NumPy** | BSD-3-Clause | Numerical arrays, bounding clamp, and metrics |
| **Pytest** | MIT License | Engine testing framework |
| **Diffusers** | Apache-2.0 | Latent diffusion AutoencoderKL interface (optional) |

---

## 3. Neural Model Weights & Research Attribution

### ResNet-18 Perceptual Embeddings
- **Origin**: PyTorch Torchvision Model Zoo (`torchvision.models.resnet18(weights=ResNet18_Weights.DEFAULT)`)
- **License**: BSD 3-Clause License
- **Commercial Use**: Permitted under BSD 3-Clause conditions.

### Stable Diffusion VAE (`sd-vae-ft-mse` / `AutoencoderKL`)
- **Origin**: Stability AI (`stabilityai/sd-vae-ft-mse`) / CompVis
- **License**: **CreativeML OpenRAIL-M**
- **Commercial Use & Distribution Terms**:
  - Permitted under CreativeML OpenRAIL-M.
  - Distribution of weights or outputs is subject to Annex A Behavioral Use Restrictions (e.g., prohibition of unlawful, defamatory, or harmful generation).
  - VeilGuard does not bundle these weights by default. Users may download them voluntarily or point `VEILGUARD_SD_VAE_PATH` to a local safetensors directory.

### Academic Research Attribution: MIT PhotoGuard
- **Paper**: *Raising the Cost of Malicious AI-Powered Image Editing* (Salman et al., MIT CSAIL, 2023)
- **Repository**: [https://github.com/MadryLab/photoguard](https://github.com/MadryLab/photoguard)
- **Code License**: MIT License
- **Notice**: The mathematical PGD latent encoder attack implemented in VeilGuard's `photoguard.py` adapter is adapted from the academic research by Salman et al. All rights and academic priority remain with the original authors.
