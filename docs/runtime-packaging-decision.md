# VeilGuard — Self-Contained Windows Runtime Packaging Decision

**Document Version**: 1.0.0  
**Target Release**: VeilGuard v0.1.0-rc1  
**Architecture**: Windows x64 (AMD64)  
**Host Environment**: Windows 11, Python 3.11.9, PyTorch 2.4.1+cpu  

---

## 1. Dependency Audit & Footprint Analysis

To determine whether VeilGuard can or should package a self-contained Python and PyTorch runtime, we audited the actual disk footprint of all required and optional runtime dependencies in the active Windows x64 environment.

### A. Runtime Dependencies Breakdown

| Component | Modules / Assets | Disk Size (Uncompressed) | Purpose | Mandatory? |
|---|---|---|---|---|
| **Python Standard Library** | Python 3.11 DLLs, Lib, C-extensions | ~38 MB | Language interpreter & standard modules | Yes |
| **Pillow (`PIL`)** | C-extensions, decoders, encoders | 15.52 MB | Image loading, metadata, saving (PNG/JPEG) | Yes |
| **NumPy** | C-extensions, BLAS/LAPACK bindings | 33.04 MB | Pixel arrays, $L_\infty$ bounding clamping | Yes |
| **PyTorch (`torch`)** | `torch_cpu.dll` (295 MB), C10, OpenMP | **518.34 MB** | Tensor math & autograd for neural disruption | Yes (Neural methods) |
| **Torchvision** | `models/resnet18`, ops | 7.09 MB | Multi-scale perceptual loss embeddings | Yes (Neural methods) |
| **Diffusers** | `AutoencoderKL` pipeline | 55.00 MB | VAE encoder attack for PhotoGuard | Optional (Blocked by default) |
| **SD VAE Model Weights** | `sd-vae-ft-mse` safetensors | ~335.00 MB | Latent diffusion autoencoder weights | Optional (User download) |
| **Total Uncompressed Footprint** | Complete ML Runtime | **~667 MB** (excluding weights) | | |

### B. Development vs. Production Runtime Segregation

The following dependencies are strictly segregated and excluded from the production distribution:
- **Excluded Development Dependencies**:
  - `pytest`, `pytest-timeout`, `anyio` (~18 MB).
  - Test suites (`engine/tests/`, `apps/desktop/tests/`) and cached pyc files (`__pycache__`, `.pytest_cache`).
  - Vitest, Happy-DOM, ESLint, TypeScript compiler tooling.
- **Excluded Weights**:
  - CreativeML OpenRAIL-M model weights (`sd-vae-ft-mse`, ~335 MB) are excluded from the installer by default to preserve user privacy and prevent silent multi-hundred megabyte downloads.

---

## 2. Technical Evaluation of Packaging Strategies

We compared three architectural strategies for Windows distribution:

### Strategy A: Standalone PyInstaller Executable (`veilguard-engine.exe`)
- **Mechanism**: Use PyInstaller or Nuitka to compile `run_engine.py` into a monolithic standalone executable (`veilguard-engine.exe`) placed in `resources/engine/`.
- **Package Size Impact**:
  - Single-file (`--onefile`): ~380 MB compressed binary.
  - Adds ~300 MB to the NSIS installer (inflating installer from 84 MB to ~380 MB).
- **Startup Latency**:
  - PyInstaller `--onefile` must decompress ~750 MB of DLLs (including `torch_cpu.dll` at 295 MB) into `%TEMP%` on **every cold startup**.
  - Measured decompression latency on Windows: **8 to 14 seconds** before the IPC stdin/stdout pipe opens.
- **Reliability & Failure Modes**:
  - High risk of antivirus false positives (Windows Defender heuristic flags PyInstaller boots).
  - Missing Visual C++ redistributable dependencies (`MSVCP140.dll`, `VCRUNTIME140_1.dll`) on older Windows 10 machines cause silent process termination.
  - Dynamic module loading in `torch` and `diffusers` frequently fails under PyInstaller unless dozens of hidden imports and hooks are continuously maintained.

### Strategy B: Managed Embedded Python Runtime (`python-embed-amd64`)
- **Mechanism**: Download official Microsoft/Python.org embeddable package (`python-3.11.9-embed-amd64.zip`, ~10 MB) into `resources/engine/python/`, configure `python311._pth` to import site-packages, and pre-populate pinned CPU-only wheels.
- **Package Size Impact**:
  - Adds ~600 MB uncompressed to the installer.
  - NSIS installer size increases from **84 MB to ~285 MB**.
  - Portable standalone executable increases from **84 MB to ~285 MB**.
- **Startup Latency**:
  - Fast (~150–250ms), identical to standard Python.
- **Reliability & Failure Modes**:
  - **CPU Incompatibility**: PyTorch CPU wheels for Windows x64 require **AVX2 instruction sets**. Older processors (or hypervisors without AVX2 passthrough) will crash with `Illegal Instruction` (`0xC000001D`) with no graceful fallback.
  - **Download Bloat**: Forces every user—including those using only lightweight baseline noise or those with existing CUDA environments—to download an extra 200+ MB payload.
  - **Update Overhead**: Updating PyTorch or security patches requires repackaging and distributing the entire 285 MB Electron application.

### Strategy C: Host Python Prerequisite with 1-Click Automated Environment Setup (Selected Approach)
- **Mechanism**: Retain the lightweight 84 MB desktop package. Provide an automated PowerShell script (`scripts/setup_engine_env.ps1`) that creates a dedicated `.venv` in the engine directory with pinned CPU dependencies. The desktop application automatically discovers Python, and displays clear, helpful diagnostics if Python is not yet configured.
- **Package Size Impact**:
  - Zero bloat: Installer remains **84.0 MB**, downloads in seconds, and installs instantly.
- **Startup Latency**:
  - Instantaneous Electron boot (~400ms); engine health check responds in ~150ms.
- **Reliability & Flexibility**:
  - Allows users with NVIDIA GPUs to install CUDA-accelerated PyTorch without fighting a bundled CPU-only runtime.
  - If Python is absent, the application launches cleanly and displays friendly diagnostic guidance rather than crashing.

---

## 3. Comparison Matrix

| Criteria | Strategy A: PyInstaller Executable | Strategy B: Embedded Python Runtime | Strategy C: External Prerequisite + 1-Click Setup |
|---|---|---|---|
| **Installer Size** | ~380 MB | ~285 MB | **84.0 MB (Optimal)** |
| **Cold Startup Latency** | 8 – 14 seconds (Decompression) | 150 – 250 ms | **150 – 250 ms** |
| **Build & CI Complexity** | Very High (Hook maintenance) | Moderate (Wheel population) | **Low & Reproducible** |
| **Antivirus Safety** | Poor (High heuristic false positive rate) | Excellent (Official DLLs) | **Excellent** |
| **GPU Flexibility** | None (Locked to bundled CPU wheel) | None (Locked to bundled CPU wheel) | **High (User can choose CPU or CUDA)** |
| **Graceful Degradation** | Hard crash if DLL fails | Hard crash if AVX2 absent | **Graceful UI Diagnostic Notice** |

---

## 4. Architectural Decision & Implementation

### Selected Decision
We retain **Strategy C (Prerequisite-Based Beta with Automated Environment Setup)** for VeilGuard v0.1.0-rc1:
1. **Pin Exact Compatible Dependencies**: Pinned in `engine/requirements.txt` with clear CPU and CUDA installation commands.
2. **Automated Setup Script**: Created `scripts/setup_engine_env.ps1` to allow 1-click venv creation for users with Python 3.11/3.12.
3. **Resilient UI Diagnostics**: When Python is absent, the desktop app displays an informative diagnostic guidance card explaining how to configure the engine, rather than leaving the user with an unexplained error.
4. **Honest Labeling**: VeilGuard v0.1.0-rc1 is labeled accurately as a **Private Beta** requiring host Python 3.11+, rather than falsely claiming to be self-contained.
