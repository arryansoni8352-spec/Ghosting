# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `0.1.0-rc1` (Release Candidate) | :white_check_mark: Current Release Candidate |
| `0.1.0-dev` (Development) | :white_check_mark: Active branch |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

To report a security issue:
1. Contact the project maintainers privately via GitHub Security Advisories or direct developer channel.
2. Include a technical description of the vulnerability, reproduction steps, and potential attack vector.
3. Acknowledgement will be provided promptly with coordinated disclosure upon remediation.

---

## Security Architecture & Hardening Guarantees

- **Local-First Isolation**: All image processing and tensor calculations execute exclusively on the local machine. Zero external network calls are performed by the application runtime.
- **Strict Content Security Policy (CSP)**:
  ```
  default-src 'self'; script-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'none';
  ```
  The production CSP forbids external network connections (`connect-src 'none'`) and remote script execution.
- **Process Boundaries & Context Isolation**:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`
  - `webSecurity: true`
  The renderer has zero direct access to Node.js APIs or filesystem primitives.
- **Validated IPC Boundary**: All IPC channels are strictly allowlisted. Every message payload is validated and sanitized against path traversal, null-byte injections, prototype pollution, and dimension boundaries.
- **External Navigation Safeguards**: `mainWindow.webContents.setWindowOpenHandler` is set to deny all popup windows. External links are intercepted and opened exclusively via the system default browser through `shell.openExternal`.
- **Dependency Audit Posture**:
  - Regular automated dependency audits via `npm audit`.
  - Non-breaking security fixes applied across runtime dependencies.
  - Development and build-time devDependencies (such as Vite dev server and Vitest test runner) are segregated from the production runtime bundle (`app.asar`).

---

## Known Operational Boundaries

- **Adversarial Robustness Limits**: Adversarial perturbations are bounded ($L_\infty \le 8/255$ on lossless PNG) and designed to disrupt deep feature representations. They do not constitute cryptographically unalterable watermarks. Downstream transformations (lossy JPEG recompression, aggressive spatial downsampling, Gaussian blurring) degrade perturbation efficacy.
- **Model Weight Boundaries**: Optional third-party diffusion model weights (`stabilityai/sd-vae-ft-mse`) are governed by the CreativeML OpenRAIL-M license and require user consent prior to local download.
