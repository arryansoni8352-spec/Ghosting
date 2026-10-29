# VeilGuard v0.1.0-rc1 — Private Beta Test Plan

**Document Version**: 1.1.0 (Beta Readiness Corrected)  
**Target Release Candidate**: VeilGuard v0.1.0-rc1  
**Target Platform**: Windows 10 / Windows 11 (64-bit)  
**Distribution Channel**: Controlled Private Beta (Trusted Testers Only)  

---

## 1. Objective & Scope

The objective of this private beta test is to validate the actual end-user Windows installation, system compatibility, performance, and everyday workflow before any public distribution.

Because the release candidate binaries are currently **unsigned** and the host build environment enforces Windows Application Control (WDAC), end-to-end installation and uninstallation on an independent, clean Windows machine remain to be executed by trusted beta testers. Unit tests, IPC mocks, and developer workstation smoke tests must **not** be confused with clean-machine independent verification.

---

## 2. Beta Distribution Artifacts, Checksum Verification & Security Policy

### Artifact Manifest

Testers must verify the integrity of the distributed test binaries using PowerShell against the official release checksums before executing:

```powershell
Get-FileHash .\VeilGuard*.exe -Algorithm SHA256 | Format-List
```

| Package Type | Filename | Size | Expected SHA-256 Checksum |
|---|---|---|---|
| **NSIS Installer** | `VeilGuard Setup 0.1.0-rc1.exe` | 88,075,992 bytes (~84.0 MB) | `C1D7CB40EA461F3DB60C4AD00625FEE9F2F25FF2605D7003352023AF93506CE0` |
| **Portable Executable** | `VeilGuard 0.1.0-rc1.exe` | 87,898,553 bytes (~83.8 MB) | `80B14BB56F20AF55A7E4655B14CBFAC6BF6AF23B28F6C26E79D539D2014F2088` |

### Security & Unsigned Binary Guidance

> [!CAUTION]
> **Important Security Advisory for Beta Testers**  
> - **Unsigned Binaries**: The current beta binaries are **not digitally signed** with an Authenticode certificate.
> - **Source Verification**: Testers must verify that the SHA-256 hash matches the table above and that the binary was acquired directly from the official project maintainers.
> - **Security Policy Compliance**: Testers must strictly adhere to their organization's and operating system's security policies. **Do not bypass Windows Defender Application Control (WDAC), AppLocker, or corporate enterprise policy blocks.** If your environment blocks execution of unsigned binaries, record the test as `BLOCKED BY POLICY` and notify maintainers.
> - **Code Signing Notice**: Code signing reduces untrusted publisher warnings in Windows SmartScreen, but code signing alone does not guarantee software safety. The application source code, CSP isolation, and local privacy guarantees remain the fundamental security boundary.
> - **Restricted Distribution**: Beta distribution is strictly restricted to authorized, trusted participants. Do not redistribute these binaries publicly.

---

## 3. Host System & Python Runtime Prerequisites

> [!IMPORTANT]
> **VeilGuard v0.1.0-rc1 is NOT a self-contained bundle containing Python.**  
> The desktop installer bundles the Electron shell, React interface, and Python engine source scripts, but does **not** include a standalone embedded Python interpreter or bundled PyTorch binary.

### Prerequisites for Clean Machines
To run neural protection processing, the host system requires a compatible Python 3.11 environment:
- **Operating System**: Windows 10 (Build 19041+) or Windows 11 (64-bit).
- **Verified Python Version**: **Python 3.11.9 (64-bit)**. *(Python 3.12 is NOT verified locally).*
- **Pinned Tested Dependencies (`engine/constraints.txt`)**:
  - `torch==2.15.0+cpu`
  - `torchvision==0.29.2+cpu`
  - `pillow==13.0.0`
  - `numpy==2.4.6`
  - `psutil==7.2.2`
  - Optional for PhotoGuard: `diffusers==0.42.1`, `safetensors==0.8.0`
- **Automated Setup Script**:
  Run the user-initiated setup script in PowerShell:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\setup_engine_env.ps1
  ```
  This creates an isolated, persistent virtual environment in `%LOCALAPPDATA%\VeilGuard\engine-env`.
- **Python Discovery Rules (Priority Order)**:
  1. `VEILGUARD_PYTHON_PATH` environment variable (if explicitly set).
  2. `%LOCALAPPDATA%\VeilGuard\engine-env\Scripts\python.exe` (managed persistent per-user environment).
  3. `<engine>\.venv\Scripts\python.exe` (repository/developer local environment).
  4. `%LOCALAPPDATA%\Programs\Python\Python311\python.exe` (standard user Python 3.11 install).
  5. System `PATH` (`python.exe`).
- **Missing Python Error Behavior**:
  If Python or the required dependencies are absent, the desktop application launches cleanly, and displays an informative diagnostic guidance card explaining how to configure the engine, rather than crashing the desktop app.

---

## 4. Test Scenarios Matrix & Current Verification Status

Every scenario is explicitly categorized as:
- **AUTOMATED PASS**: Verified by automated test suites (`pytest`, `vitest`, `tsc`).
- **MANUAL PASS**: Manually verified by an engineer on the development workstation.
- **FAIL**: Defect or reproducible error identified.
- **NOT VERIFIED**: Requires execution by an independent tester on a clean, isolated Windows system.

| # | Scenario | Scope / Actions | Current Status | Current Evidence / Remaining Work |
|---|---|---|---|---|
| **1** | **Clean Windows Installation** | Execute `VeilGuard Setup 0.1.0-rc1.exe` on clean Windows 10/11. Verify installer wizard, `%LOCALAPPDATA%\Programs\veilguard-desktop` files, desktop shortcut, and Start menu entry. Test `VeilGuard 0.1.0-rc1.exe` portable standalone separately. | **NOT VERIFIED** | Developer workstation blocked execution via Windows Application Control. Needs independent clean-machine validation. |
| **2** | **App Launch & Initial Rendering** | Launch installed app. Confirm window opens smoothly, dark-mode CSS renders, no white flash. Click "About" in sidebar to verify version `0.1.0-rc1` and licensing. | **MANUAL PASS** (Dev) / **NOT VERIFIED** (Clean Install) | Smoke-tested via developer build and unpackaged binary. Needs verification on clean test system. |
| **3** | **Image Ingestion & Format Validation** | Ingest JPEG, RGB PNG, and RGBA PNG via file picker and drag-and-drop. Check preview, dimensions, aspect ratio, format tag, and file size. | **AUTOMATED PASS** (Vitest/Pytest) / **MANUAL PASS** (Dev) | Tested in developer environment; unit tests verify format detection and preview data URLs. |
| **4** | **Protection Processing Workflow** | Execute **"Baseline Random Noise"** and **"Neural Feature Disruption"** at strength 8. Verify streaming progress bar (0% $\to$ 100%), non-frozen UI, and peak memory $\le 1.2$ GB. | **AUTOMATED PASS** (Pytest/E2E runner) / **MANUAL PASS** (Dev) | Engine E2E runner confirmed 5-step PGD execution and progress callbacks. Needs real tester runtime timing. |
| **5** | **Result Export & Viewer Compatibility** | Export protected image to user-chosen location. Open exported file in Windows Photos, Paint, and browser. Verify source image is preserved untouched. | **AUTOMATED PASS** (Pytest/E2E runner) / **MANUAL PASS** (Dev) | Byte-for-byte original file preservation verified. External viewer check needs independent tester. |
| **6** | **Strict $L_\infty$ Bound Verification** | Reopen exported lossless PNG. Compute $\max \|I_{\text{clean}} - I_{\text{protected}}\|$ to guarantee $\le 8/255$. Verify lossy JPEG exports display disclaimer. | **AUTOMATED PASS** (Pytest `test_linf_constraint.py`) | Disk check verified $\max \Delta = 8/255$ on PNG. JPEG lossy behavior verified. |
| **7** | **Unavailable Model Weights Handling** | Select **"MIT PhotoGuard (Encoder Attack)"** without weights. Verify `BLOCKED` status badge, disabled button (`Prerequisite Required`), and no application crash. | **AUTOMATED PASS** (Pytest `test_photoguard_adapter.py`) | Verified in engine tests. UI prerequisite modal verified in desktop dev build. |
| **8** | **Stress Testing & Edge Cases** | Test processing cancellation, dragging non-image files, oversized images ($>50$ MB or $>8192$ px), and read-only destination paths. | **AUTOMATED PASS** (Vitest security suite) / **NOT VERIFIED** (GUI) | IPC handlers reject path traversal, null bytes, and oversized files. Cancellation button needs tester verification. |
| **9** | **Non-Destructive Integrity** | Process multiple images sequentially using "Process New Image" and "Adjust Parameters". Verify no memory leak or original file alteration. | **AUTOMATED PASS** (E2E runner) / **NOT VERIFIED** (Long-session) | Workflow verified in automated runner. Multi-hour stability needs beta tester observation. |
| **10** | **Clean Uninstallation** | Uninstall via Windows Settings $\to$ Apps. Confirm removal of `%LOCALAPPDATA%\Programs\veilguard-desktop` and shortcuts. Confirm user exports and source photos are untouched. | **NOT VERIFIED** | Uninstaller was not executed on clean machine due to WDAC policy. Needs independent verification. |

---

## 5. Uninstallation & Data Preservation Architecture

Testers evaluating Scenario 10 must understand the intended lifecycle behavior:
- **What is Removed**:
  - The application binary directory (`%LOCALAPPDATA%\Programs\veilguard-desktop`).
  - Desktop and Start Menu shortcuts.
  - Windows registry uninstall entries (`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\veilguard-desktop`).
- **What is Preserved (By Design)**:
  - User-exported images: VeilGuard never touches or deletes files in user directories (`Desktop`, `Pictures`, `Documents`).
  - User preferences: Application configuration (`%APPDATA%\veilguard-desktop\preferences.json`) is preserved so returning users retain settings.
  - Local model weights: Any user-configured diffusion checkpoints (e.g. `sd-vae-ft-mse`) are retained.

---

## 6. Tester Privacy & Safe Log Redaction

> [!IMPORTANT]
> **Strict Privacy Protocol for Beta Reports**  
> 1. **Do NOT Send Personal Photographs**: Never attach personal photos or sensitive imagery to bug reports.
> 2. **Redact Local Usernames & Paths**: Before sharing log snippets or screenshots, sanitize your Windows username:
>    - Replace `C:\Users\JohnDoe\AppData\...` with `C:\Users\<user>\AppData\...`
>    - Replace personal folder names with `<redacted_dir>`
> 3. **No Automatic Telemetry**: VeilGuard has zero background telemetry. All feedback must be submitted manually and voluntarily.
> 4. **No Credentials or Secrets**: Bug reports must never include environment variables containing credentials, API keys, or machine UUIDs.

---

## 7. Exit Criteria Checklist for Public Release

Before VeilGuard can be declared ready for a public production release, the following gates must be satisfied:

- [ ] **Independent Clean-Machine Pass**: At least one independent tester successfully executes Scenarios 1–10 on clean Windows 10 and Windows 11 hardware without pre-existing dev dependencies.
- [ ] **Authenticode Code Signing**: Production binaries must be signed with a valid commercial code-signing certificate to prevent SmartScreen untrusted publisher warnings.
- [ ] **Python Runtime Strategy Resolved**: Either bundle a lightweight standalone Python runtime (e.g. PyInstaller or embedded Python) or provide an automated prerequisite installer/checker for end users.
- [ ] **Cross-Platform Native CI Runs**: Successful build and test execution of `.github/workflows/release.yml` on native GitHub Actions runners for macOS (`.dmg`) and Linux (`.AppImage`).
- [ ] **Zero Unresolved Blocker Defects**: All reported crashes, memory exhaustion issues, or path handling defects investigated and resolved.
