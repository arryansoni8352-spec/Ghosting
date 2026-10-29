# Licensing Review — VeilGuard

**Status:** Updated for Milestone 2 Research Integration.

> [!CAUTION]
> This document records legal and engineering due diligence. Obtain qualified legal counsel before commercial release.

---

## 1. Application Architecture Licensing

| Component | Repository / Package | License | Commercial Permissibility | Notes |
|-----------|----------------------|---------|---------------------------|-------|
| VeilGuard Desktop | `apps/desktop` | Selected by Owner | ✅ Yes | Electron + React 19 + TypeScript |
| Engine Interface | `packages/engine-interface` | Selected by Owner | ✅ Yes | TypeScript contract definitions |
| Protection Engine | `engine/veilguard_engine` | Selected by Owner | ✅ Yes | Python core orchestration |

---

## 2. Research Algorithm Licensing Review

### A. Neural Feature Disruption (Integrated & Active)
- **Code:** Original VeilGuard implementation based on Sabour et al. / Goodfellow et al.
- **Model Architecture & Weights:** PyTorch / Torchvision `models.resnet18`
- **License:** **BSD 3-Clause License**
- **Commercial Permissibility:** **Fully Permitted**. BSD 3-Clause permits commercial use, modification, and redistribution with standard attribution. Does not impose copyleft obligations or use restrictions.

### B. MIT PhotoGuard (MadryLab)
- **Code:** [MadryLab/photoguard](https://github.com/MadryLab/photoguard) — **MIT License** (Permissive)
- **Model Weights Required:** Stable Diffusion Inpainting (`AutoencoderKL`, `UNet2DConditionModel`)
- **Model License:** **CreativeML Open RAIL-M**
- **Commercial Permissibility:**
  - Open RAIL-M allows commercial exploitation of model outputs and fine-tunes.
  - **However**, Section 5 and Attachment A impose explicit use restrictions (prohibiting generating non-consensual imagery, harmful defamation, medical advice, etc.) and mandate that any redistributed downstream weights carry the identical license and terms.
  - **Commercial Decision for VeilGuard:** Bundling 335MB+ of Open RAIL-M weights directly inside commercial binaries introduces compliance and distributor liability. Therefore, PhotoGuard is architecturally defined and verified, but **isolated behind a `BLOCKED` status** until the user explicitly provides local model weights (`VEILGUARD_SD_VAE_PATH`).

### C. Other Academic Immunization Frameworks
- **Glaze (University of Chicago):** Proprietary academic license for the compiled tool. Commercial repackaging or reverse engineering is explicitly disallowed.
- **Anti-DreamBooth (VinAI):** **AGPL-3.0**. Copyleft license requiring any software communicating with or embedding the code to be fully open-sourced under AGPL-3.0. Incompatible with proprietary commercial desktop distribution.
- **AdvDM / MIST:** Academic research code; relies directly on Stable Diffusion diffusion pipelines under Open RAIL-M.

---

## 3. Summary of Commercial Compliance

1. **Active Engine Default:** Only BSD-3 and MIT compatible components run in standard local execution paths.
2. **No Secret or Silent Downloads:** Model weights are never fetched silently in the background, ensuring strict compliance with offline and privacy policies.
3. **No Simulation of Blocked Algorithms:** If an algorithm is blocked by licensing or weights, VeilGuard reports `BLOCKED` with diagnostic explanation.
