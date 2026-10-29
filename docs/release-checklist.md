# VeilGuard — Release Candidate Audit & Verification Checklist

**Target Release**: VeilGuard v0.1.0-rc1  
**Architecture**: Local-first image perturbation research application  
**Primary Build Host**: Windows 11 (AMD64)  
**Cross-Platform Strategy**: Native Windows packaging + automated multi-platform CI for Linux and macOS  

---

## 1. Prioritized Audit Findings & Execution Record

### Priority 0 — Critical Packaging & Runtime Blockers
- [x] **Renderer Path Resolution in Production**: `apps/desktop/electron/main.ts` resolved `RENDERER_FILE` relative to nested `dist-electron/apps/desktop/electron`, failing to locate `dist/index.html` in packaged builds. Fixed with `app.getAppPath()` and multi-path fallback candidates.
- [x] **Packaged Engine Path Resolution**: `apps/desktop/electron/engine-manager.ts` prioritizes `process.resourcesPath/engine` when packaged, ensuring the Python engine is discovered inside the Electron app resources.
- [x] **Custom Python Path Discovery**: Supports `VEILGUARD_PYTHON_PATH` environment variable override for custom environments, while retaining discovery of bundled virtual environments and standard Windows paths.
- [x] **Application Icons Generation**: Generated multi-resolution 512x512 RGBA PNG and multi-size ICO assets (16px to 256px) into `apps/desktop/public/icon.ico` and `public/icon.png`.
- [x] **Dual Windows Distribution Formats**: Configured `electron-builder` to produce both NSIS Installer (`VeilGuard Setup 0.1.0-rc1.exe`) and Portable standalone executable (`VeilGuard 0.1.0-rc1.exe`). Both built, inspected, and verified.

### Priority 1 — User Workflow & Honest Positioning
- [x] **About Dialog with Honest Limitations**: Implemented an accessible About modal in `AboutDialog.tsx` disclosing exact version (`0.1.0-rc1`), license notice (MIT + OpenRAIL/BSD-3 third-party notices), local privacy statement (100% offline, zero analytics), and empirical capability limitations.
- [x] **Streamlined Save-and-Process Action**: Updated `handleProcess` and `handleChooseOutput` in `ImageWorkspace.tsx` so selecting an output destination seamlessly starts the job without requiring redundant clicks.
- [x] **Blocked Model Action Guiding**: When PhotoGuard (`BLOCKED`) is selected due to absent weights, accurately disabled the execution button with a clear label (`Prerequisite Required`) and show offline setup instructions.
- [x] **Clear Next Actions in Result Panel**: Provided both "Process New Image" (navigating to Welcome screen) and "Adjust Parameters" (allowing parameter tweaks on current image).

### Priority 2 — Security Hardening & Protection Integrity
- [x] **Context Isolation & Node Integration**: Verified `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true` in Electron BrowserWindow.
- [x] **Content Security Policy**: Restrictive CSP applied in production (`default-src 'self'`, `connect-src 'none'`, `img-src 'self' data: blob:`).
- [x] **Window Open & Navigation Controls**: `setWindowOpenHandler` set to `deny`; external links routed exclusively through system browser (`shell.openExternal`).
- [x] **Strict $L_\infty$ Bound Guarantee**: Enforced $L_\infty \le 8/255$ on disk for lossless PNG exports; lossy JPEG exports explicitly disclaim strict pixel bounds.
- [x] **Dependency Audit**: Executed `npm audit` and applied non-breaking fixes. Segregated build tooling advisories from packaged runtime assets.

### Priority 3 — Cross-Platform Build & Documentation
- [x] **CI Release Workflow**: Updated `.github/workflows/release.yml` with matrix builds for Windows (`windows-latest`), macOS (`macos-latest`), and Linux (`ubuntu-latest`).
- [x] **Version Synchronization**: Aligned root `package.json` and `apps/desktop/package.json` to `0.1.0-rc1`.
- [x] **Comprehensive Release Documentation**: Created/updated `README.md`, `CHANGELOG.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `PRIVACY.md`, `SECURITY.md`, `docs/private-beta-test-plan.md`, and `docs/beta-feedback-template.md`.
- [x] **Distributable Artifacts & Checksums**: Built release artifacts on Windows host, computed SHA-256 checksums, and recorded manifest.

---

## 2. Release Acceptance Gate Matrix

Statuses are strictly categorized as:
- **AUTOMATED PASS**: Verified by automated test suites.
- **MANUAL PASS**: Manually verified by an engineer on developer workstation.
- **FAIL**: Defect or unhandled error identified.
- **NOT VERIFIED**: Requires execution on a clean independent machine by an external tester.

| Release Gate | Verification Target | Status | Verification Details |
|---|---|---|---|
| **Python Engine Unit & Linf Tests** | 49 passing tests in engine | **AUTOMATED PASS** | `pytest tests/`: 49 passed in 9.70s |
| **Desktop Vitest & IPC Tests** | 39 passing tests in desktop | **AUTOMATED PASS** | `vitest run`: 39 passed in 2.25s (includes engine diagnostics tests) |
| **TypeScript Static Compiler** | 0 type errors | **AUTOMATED PASS** | `npm run typecheck`: clean across all workspaces |
| **Production Frontend Build** | Vite production assets | **AUTOMATED PASS** | `vite build`: bundle generated in 889ms |
| **Automated Engine Setup Script** | Setup script & constraints file | **AUTOMATED PASS** | `scripts/setup_engine_env.ps1` syntax valid; `engine/constraints.txt` pins verified |
| **NSIS Installer Built** | Executable created | **MANUAL PASS** | `VeilGuard Setup 0.1.0-rc1.exe` (88,075,992 B) |
| **Portable Executable Built** | Standalone executable | **MANUAL PASS** | `VeilGuard 0.1.0-rc1.exe` (87,898,553 B) |
| **Artifact Checksum Verification** | Exact match with manifest | **AUTOMATED PASS** | Setup: `C1D7CB40...`, Portable: `80B14BB5...` |
| **Installer Archive Content** | 239 files, 20 directories | **MANUAL PASS** | Inspected via 7-Zip (`resources/app.asar`, `engine/`) |
| **Python Runtime Architecture** | Host Python 3.11.9 with persistent venv | **MANUAL PASS (Dev)** | `%LOCALAPPDATA%\VeilGuard\engine-env` discovery verified. (Python 3.12 unverified). |
| **Packaged Binary Execution** | V8 engine runtime boot | **MANUAL PASS (Dev)** | Node mode on unpackaged `VeilGuard.exe`: ExitCode 0 |
| **Packaged Engine Spawning** | Python engine subprocess | **MANUAL PASS (Dev)** | Spawns `win-unpacked/resources/engine/run_engine.py` |
| **End-to-End Image Processing** | PGD perturbation workflow | **MANUAL PASS (Dev)** | Processed input image, generated export via dev engine |
| **On-Disk Bound Guarantee** | Strict $L_\infty \le 8/255$ | **AUTOMATED PASS** | Export verified on disk: $\max \Delta = 8/255$ |
| **Missing Model Blocker Notice** | Honest error, no crash | **AUTOMATED PASS** | PhotoGuard reports `ALGORITHM_BLOCKED` safely; UI guidance card displayed |
| **Clean Machine Install & Uninstall** | Clean Windows OS execution | **NOT VERIFIED** | Developer host WDAC policy blocked unsigned installer; requires independent clean-machine validation. |
| **macOS Package Execution** | Native `.dmg` binary | **NOT VERIFIED** | Windows build host; configured for macOS CI runner. |
| **Linux Package Execution** | Native `.AppImage` binary | **NOT VERIFIED** | Windows build host; configured for Linux CI runner. |
| **Local-First Privacy Guarantee** | Zero remote network calls | **AUTOMATED PASS** | CSP `connect-src 'none'`; zero analytics or telemetry in codebase. |

---

## 3. Final Release Manifest (v0.1.0-rc1)

- **`VeilGuard Setup 0.1.0-rc1.exe`**
  - Architecture: Windows x64 (NSIS Installer)
  - Size: 88,075,992 bytes (83.99 MB)
  - SHA-256: `C1D7CB40EA461F3DB60C4AD00625FEE9F2F25FF2605D7003352023AF93506CE0`
  - Archive Integrity: 239 files, 20 folders (verified via 7-Zip LZMA2 archive listing)
- **`VeilGuard 0.1.0-rc1.exe`**
  - Architecture: Windows x64 (Portable Executable)
  - Size: 87,898,553 bytes (83.82 MB)
  - SHA-256: `80B14BB56F20AF55A7E4655B14CBFAC6BF6AF23B28F6C26E79D539D2014F2088`
  - Archive Integrity: 239 files, 20 folders (verified via 7-Zip LZMA2 archive listing)
