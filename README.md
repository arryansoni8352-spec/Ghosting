# VeilGuard

**VeilGuard is a local-first desktop application for investigating image-immunization techniques.**

It implements bounded adversarial perturbations designed to interfere with deep neural image-processing pipelines while preserving perceptual visual fidelity. VeilGuard is built on strict principles of scientific transparency, local data privacy, and honest capability boundaries.

> [!IMPORTANT]
> **Research Notice & Capability Boundaries**  
> VeilGuard does **not** claim that protected images cannot be edited, inpainted, copied, or used for model training. Protection is probabilistic, bounded ($L_\infty \le 8/255$), and model-specific. Common transformations (such as JPEG re-encoding, aggressive downsampling, or Gaussian blur) degrade or eliminate adversarial perturbations. VeilGuard does not guarantee universal protection against commercial generative editors (e.g., Adobe Firefly, Midjourney, DALL-E).

---

## Key Features

- **100% Local-First Privacy**: Your photos and processed images never leave your machine. No cloud uploads, no accounts, and zero telemetry.
- **Multiple Perturbation Adapters**:
  - `Baseline Pixel Noise`: Standard evaluation baseline with bounded random noise.
  - `Neural Feature Disruption`: Authentic gradient-based PGD optimization disrupting deep perceptual feature representations (ResNet-18).
  - `MIT PhotoGuard (Encoder Attack)`: Mathematical PGD latent attack targeting Stable Diffusion's `AutoencoderKL` (Salman et al., MIT CSAIL). Faithfully reports blocked status until weights are configured.
- **Strict Verification on Disk**: Verifies $L_\infty \le 8/255$ bounds directly on exported PNG files.
- **Safe Non-Destructive Export**: Never modifies your original file; exports to a user-selected destination.
- **Cross-Platform Distribution**: Packaged for Windows (NSIS installer & standalone Portable `.exe`), with automated CI pipelines for macOS and Linux.

---

## Supported Formats & System Requirements

### Supported Formats
- **Lossless Export (Guaranteed $L_\infty$ Bound)**: PNG (RGB and RGBA).
- **Lossy Formats (No Strict Bound Due to DCT Quantization)**: JPEG, WebP.
- **Input Formats**: PNG, JPEG, WebP, TIFF (up to 50 MB, 8192×8192 px max).

### Minimum System Requirements
- **Operating System**: Windows 10/11 (64-bit), macOS 12+, or modern Linux (Ubuntu 22.04+).
- **Python Runtime Prerequisite**: Python 3.11.9 (64-bit AMD64) tested and verified. *(Python 3.12 is not verified locally).* Requires `torch`, `torchvision`, `pillow`, `numpy`, and `psutil`. *(VeilGuard v0.1.0-rc1 desktop packages bundle the Electron shell and engine scripts, but do not bundle an embedded Python interpreter to prevent 300+ MB payload bloat).*
- **RAM**: 4 GB minimum (8 GB recommended for neural models).
- **Disk Space**: ~250 MB for desktop application and core engine; ~1.5 GB for persistent Python engine virtual environment; +335 MB if optional diffusion VAE weights are installed.
- **Processor**: x86-64 CPU with AVX2 support, or Apple Silicon (macOS). GPU acceleration optional (CUDA).

---

## Installation & Running

### Windows (Controlled Private Beta)
Pre-built release candidate binaries are provided for controlled private beta testing only:
- **Installer**: `VeilGuard Setup 0.1.0-rc1.exe`
- **Portable**: `VeilGuard 0.1.0-rc1.exe`

> [!WARNING]
> **Beta Security & Unsigned Binary Notice**  
> These binaries are **not digitally signed** with an Authenticode certificate and are **marked NOT VERIFIED on clean consumer Windows machines**. Windows SmartScreen will display an unknown publisher warning. Testers must comply with applicable organizational security policies. **Do not bypass Windows Defender Application Control (WDAC), AppLocker, or corporate security blocks.** Code signing may reduce publisher warnings but does not establish safety on its own. For maximum auditability and compliance, running from source via Python and Node.js is recommended.

### Automated Engine Setup (Recommended for Windows)

To configure the Python engine for both the installer and portable builds without manual package hunting:

1. Ensure 64-bit **Python 3.11.9** is installed from [python.org](https://www.python.org/downloads/release/python-3119/) (ensure "Add python.exe to PATH" is checked).
2. Open PowerShell in the VeilGuard folder and run the user-initiated setup script:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\setup_engine_env.ps1
   ```
   **What the script does:**
   - Checks available disk space ($\ge 1.5$ GB required).
   - Validates that Python is a 64-bit AMD64 runtime.
   - Creates a persistent virtual environment in `%LOCALAPPDATA%\VeilGuard\engine-env` (persisting across updates and portable restarts).
   - Installs pinned, verified dependencies from `engine/constraints.txt`.
   - Runs a live stdio health check over JSON IPC to confirm the engine is responsive.
   - Never runs automatically on startup; execution is always explicitly user-initiated.

If the engine is not configured, the VeilGuard desktop app will still launch cleanly and display an informative diagnostic guidance card explaining how to configure the engine.

### Manual / Developer Setup

#### 1. Clone & Install Node Dependencies
```bash
git clone <repo-url> veilguard
cd veilguard
npm install
```

#### 2. Configure Python Engine
```bash
cd engine
python -m venv .venv

# On Windows
.venv\Scripts\activate

# On macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

#### 3. Run Development Environment
```bash
# From repository root
npm run dev
```

---

## Model Setup & Offline Operation

VeilGuard operates completely offline by default. Zero network requests are made during runtime.

### Enabling MIT PhotoGuard (Stable Diffusion VAE)
Because model weights (~335 MB) are governed by the **CreativeML OpenRAIL-M** license, VeilGuard does **not** download them silently.

To enable PhotoGuard:
1. Download the `stabilityai/sd-vae-ft-mse` checkpoint (safetensors or PyTorch format) from Hugging Face.
2. Set the `VEILGUARD_SD_VAE_PATH` environment variable to the path containing the weights:
   ```bash
   # Windows PowerShell
   $env:VEILGUARD_SD_VAE_PATH = "C:\models\sd-vae-ft-mse"
   ```
3. Launch VeilGuard. The PhotoGuard adapter will automatically transition from `BLOCKED` to `AVAILABLE`.

---

## Reproducible Testing & Quality Gates

Run the comprehensive test suite to verify all components:

```bash
# 1. Python Engine Tests (49 tests)
cd engine
pytest tests/ -v

# 2. Desktop & IPC Security Tests (36 tests)
cd ../apps/desktop
npm test

# 3. TypeScript Static Typecheck (0 errors)
npm run typecheck

# 4. Production Frontend Build
npm run build

# 5. Packaged Electron Build
npm run package
```

---

## Release Artifacts Manifest (v0.1.0-rc1)

| Artifact Filename | Platform / Target | Size | SHA-256 Checksum |
|---|---|---|---|
| `VeilGuard Setup 0.1.0-rc1.exe` | Windows x64 (NSIS Installer) | ~84.0 MB | `C1D7CB40EA461F3DB60C4AD00625FEE9F2F25FF2605D7003352023AF93506CE0` |
| `VeilGuard 0.1.0-rc1.exe` | Windows x64 (Portable Executable) | ~83.8 MB | `80B14BB56F20AF55A7E4655B14CBFAC6BF6AF23B28F6C26E79D539D2014F2088` |

---

## License & Attribution

- **Core Application**: Distributed under the [MIT License](LICENSE).
- **Third-Party Notices**: See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependencies, research attributions (MIT PhotoGuard), and model licenses (BSD-3-Clause, CreativeML OpenRAIL-M).
- **Security Policy**: See [SECURITY.md](SECURITY.md).
- **Privacy Guarantee**: See [PRIVACY.md](PRIVACY.md).
