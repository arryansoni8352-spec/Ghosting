# Changelog

All notable changes to the VeilGuard project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-rc1] — 2026-10-29

### Added
- **Production Packaging for Windows**:
  - Full NSIS installer (`VeilGuard Setup 0.1.0-rc1.exe`, ~84 MB).
  - Standalone portable executable (`VeilGuard 0.1.0-rc1.exe`, ~83.8 MB).
  - Verified ASAR packaging and extraResources engine bundling.
- **Multi-Platform CI Matrix**:
  - Added `.github/workflows/release.yml` for automated native runner packaging on Windows, macOS, and Linux.
- **Desktop UI Hardening & Disclosures**:
  - Added About Dialog disclosing exact version (`0.1.0-rc1`), license notice (MIT + OpenRAIL-M), offline local privacy guarantee, and realistic capability limitations.
  - Enhanced workspace flow: selecting an output directory immediately executes protection without duplicate clicks.
  - Added dual actions on completion: "Process New Image" (returns to Welcome) and "Adjust Parameters" (resets form).
  - Added honest state handling for blocked algorithms: disabled action button with explicit prerequisite notice.
- **Security & Path Hardening**:
  - Verified context isolation, sandboxing, and strict production Content Security Policy (`connect-src 'none'`).
  - Added dynamic multi-path fallback for `RENDERER_FILE` and `resolveEnginePath` to resolve packaged assets inside Electron resources.
  - Added `VEILGUARD_PYTHON_PATH` override support for custom Python environments.
- **Testing & Verification**:
  - 49 Python engine tests passing (`pytest tests/`).
  - 39 Desktop vitest tests passing (`vitest run`).
  - 0 TypeScript errors across main process and renderer (`tsc --noEmit`).
  - End-to-end Electron verification runner passing against live Python engine subprocess.

### Changed
- Replaced celebratory green success icons with neutral completion notices and visible limitation disclaimers.
- Enforced strict $L_\infty \le 8/255$ bound verification on disk for lossless PNG exports.
- Disclaimed pixel bound guarantees for lossy formats (JPEG/WebP) due to DCT compression artifacts.

---

## [0.1.0-dev] — 2026-10-28

### Added
- Initial project structure, Electron desktop application shell, and React renderer.
- Python engine daemon with line-delimited JSON IPC over stdio.
- Basic image import (JPEG, PNG, WebP, TIFF) and metadata inspection.
- Baseline random pixel perturbation adapter.
- Neural Feature Disruption (ResNet-18 perceptual loss PGD) adapter.
- MIT PhotoGuard VAE encoder attack mathematical implementation.
- Natural image dataset benchmark and SDEdit trajectory drift evaluation scripts.
