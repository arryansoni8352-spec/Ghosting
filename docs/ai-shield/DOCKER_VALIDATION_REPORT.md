# Docker Build, Runtime & Security Validation Report (Phase 2)

**Date:** 2026-11-19
**Repository:** `https://github.com/arryansoni8352-spec/Ghosting`
**Branch:** `feature/ai-shield-staging`
**Commit:** `2d56f6be560c498ed757787bcb452701c224ba37`
**Host Environment:** Windows 11 Home (x86_64), Python 3.11.9, Node.js 20.x, Windows Defender Application Control (WDAC) active
**Local Docker Availability:** **NOT AVAILABLE** (`docker`, `docker-compose`, `podman`, and `wsl` are not installed on this host)

---

## 1. Status Overview & Test Categorization

| Area | Status | Evidence / Notes |
|---|:---:|---|
| **Local Docker Engine & Runtime** | **NOT TESTED** | Docker Engine, Compose, and WSL are not installed on this local Windows machine. |
| **Dockerfile Architecture & Syntax** | **PASSED** | Clean multi-stage design, unprivileged user `shield` (UID 10001), no baked secrets/weights, pinned Debian Bookworm base. |
| **Docker Compose Hardening** | **PASSED** | Bound to loopback `127.0.0.1:8080:8080`, tmpfs `/data` (2 GB, RAM-backed), `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges:true`. |
| **Trusted Proxy Wildcard Rejection** | **PASSED (Static) / PENDING CI** | `docker-entrypoint.sh` implements explicit case pattern matching that immediately aborts with exit code 1 if `SHIELD_FORWARDED_ALLOW_IPS='*'`. CI asserts both exit code 1 and exact stderr message. |
| **Production Authentication Hardening** | **PASSED** | Hardened in `app/core/security.py`. Rejects `auth_mode="disabled"`, `auth_mode="open"`, and empty API key digests in production. Verified via native Pytest (8/8 passed). |
| **Backend Offline Tests** | **CATEGORIZED BY SOURCE** | • Historical Linux: 218 passed, 3 deselected in 48.72s.<br>• AST Analysis: 230 test function definitions.<br>• Local Pytest: 211 collected across 23 non-JAX files; 6 files blocked by WDAC.<br>• Pending CI: `pytest -q -m "not model"` on Ubuntu. |
| **Website Vitest Suite (130 tests)** | **PASSED** | Locally reproduced on this machine: 130 tests passed across 14 test files in 14.41s. |
| **Website Production Build & CSP** | **PASSED** | Vite build cleanly injects hardened CSP: `connect-src 'none'` (standalone) and `connect-src <origin>` (configured backend). |
| **Dependency Vulnerability Audit** | **PASSED** | `npm audit` reports **0 vulnerabilities** across all 184 audited packages in `website/package-lock.json`. |
| **Continuous Integration Docker Pipeline** | **PREPARED & AUDITED** | Prepared GitHub Actions workflow `.github/workflows/docker-validation.yml` with strict error capture, reordered log dumps, and runtime auth assertions. |

---

## 2. Docker Architecture & Code Review

### Dockerfile Inspection (`shield-backend/Dockerfile`)
```dockerfile
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --create-home shield

WORKDIR /app
COPY requirements.txt requirements-ml.txt requirements-video.txt ./
RUN pip install -r requirements.txt -r requirements-ml.txt -r requirements-video.txt

COPY app ./app
COPY pyproject.toml ./
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN mkdir -p /app/models /data/jobs && chown -R shield:shield /app/models /data
USER shield

ENV SHIELD_JOB_DIR=/data/jobs \
    SHIELD_DEVICE=cpu \
    SHIELD_ALLOW_WEIGHT_DOWNLOAD=false

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=4).status == 200 else 1)"

ENTRYPOINT ["/docker-entrypoint.sh"]
```

#### Key Architecture Strengths:
1. **Unprivileged User:** Dedicated system user `shield` (UID 10001) is created and activated (`USER shield`). The container does NOT run as root.
2. **Lean System Dependencies:** Uses `python:3.12-slim-bookworm` with `--no-install-recommends` and cleans `/var/lib/apt/lists/*` to minimize attack surface.
3. **No Embedded Secrets or Weights:** Model weights checkpoint (`mobilenet_1_0_224_tf_no_top.h5`) is strictly excluded. Weights must be mounted at runtime at `/app/models:ro`.
4. **Safe Defaults:** `SHIELD_ALLOW_WEIGHT_DOWNLOAD=false` prevents silent network weight fetching.
5. **Cold-Start Healthcheck:** Healthcheck `start-period=90s` gives adequate time for JAX runtime initialization on CPU before marking the container unhealthy.

---

### Entrypoint Inspection (`shield-backend/docker-entrypoint.sh`)
```sh
#!/bin/sh
set -e

TRUST="${SHIELD_FORWARDED_ALLOW_IPS:-}"

if [ -n "$TRUST" ]; then
  case "$TRUST" in
    \*|"* "|" *")
      echo "ERROR: SHIELD_FORWARDED_ALLOW_IPS='*' is not permitted." >&2
      echo "       Set it to the actual reverse-proxy IP or CIDR (e.g. 10.0.0.1 or 10.0.0.0/8)." >&2
      exit 1
      ;;
  esac
  FORWARDED_ARGS="--proxy-headers --forwarded-allow-ips ${TRUST}"
else
  FORWARDED_ARGS=""
fi

exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8080 \
  --workers 1 \
  --no-access-log \
  $FORWARDED_ARGS \
  "$@"
```

#### Key Security Properties:
1. **Wildcard Rejection:** Any setting of `*` immediately aborts startup with exit code 1 and prints `ERROR: SHIELD_FORWARDED_ALLOW_IPS='*' is not permitted.` to stderr.
2. **Safe Fallback:** If unset, proxy headers are completely ignored (`FORWARDED_ARGS=""`), preventing header-spoofing attacks if directly exposed.
3. **Single Worker Enforcement:** Hardcodes `--workers 1`. The backend uses an in-memory job queue; multiple uvicorn workers would cause split-brain state where job queries hit worker B while worker A holds the job.
4. **Log Privacy:** Hardcodes `--no-access-log` to prevent logging query parameters, user paths, or client IP addresses in standard stdout.

---

### Compose Configuration (`shield-backend/docker-compose.yml`)
```yaml
services:
  shield:
    build: .
    image: ghosting-shield:local
    env_file: .env
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - ./models:/app/models:ro
    tmpfs:
      - /data:size=2g,uid=10001
    read_only: true
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    mem_limit: 4g
    cpus: 2
    restart: unless-stopped
```

#### Hardening Verification:
- **Loopback Port Binding:** Bound to `127.0.0.1:8080:8080` (IPv4 loopback), not `0.0.0.0:8080`. The backend is never exposed directly on public host interfaces.
- **Root Filesystem Read-Only:** `read_only: true` prevents runtime file tampering.
- **Capabilities Dropped:** `cap_drop: [ALL]` drops all Linux kernel privileges.
- **Privilege Escalation Blocked:** `no-new-privileges:true` prevents setuid binaries from gaining root.
- **In-Memory Volatile Data:** `/data` (where jobs run) is mounted as a 2 GB RAM-backed `tmpfs`. All job inputs and cloaked outputs are completely wiped on container stop/restart.
- **Resource Limits:** Constrained to 4 GB RAM and 2 CPU cores.

---

## 3. Production Authentication Gate Verification

The backend security gate in `app/core/security.py` (`check_production_settings`) was verified via Pytest (`python -m pytest tests/api/test_security.py`):

| Test Scenario | Configuration | Expected Behavior | Actual Result |
|---|---|---|:---:|
| **Gate 1** | `SHIELD_PRODUCTION_MODE=true`<br>`SHIELD_AUTH_MODE=disabled` | Refuses to start (`RuntimeError`) | **PASSED** |
| **Gate 2** | `SHIELD_PRODUCTION_MODE=true`<br>`SHIELD_AUTH_MODE=open` | Refuses to start (`RuntimeError`) | **PASSED** |
| **Gate 3** | `SHIELD_PRODUCTION_MODE=true`<br>`SHIELD_AUTH_MODE=api_key`<br>`SHIELD_API_KEY_SHA256=""` | Refuses to start (`RuntimeError`) | **PASSED** |
| **Gate 4** | `SHIELD_PRODUCTION_MODE=true`<br>`SHIELD_AUTH_MODE=api_key`<br>`SHIELD_API_KEY_SHA256="<digest>"` | Starts cleanly; requires `X-API-Key` on protected routes | **PASSED** |
| **Gate 5** | `SHIELD_PRODUCTION_MODE=false`<br>`SHIELD_AUTH_MODE=open` | Starts in development mode; open access allowed | **PASSED** |
| **Lifespan Check** | Application ASGI startup | Lifespan executes check before accepting requests | **PASSED** |

---

## 4. Local Environment Constraints & Diagnostic Record

When attempting local Docker validation on this machine:
1. `docker : The term 'docker' is not recognized` &rarr; Docker Desktop/Engine is not installed.
2. `docker compose : The term 'docker compose' is not recognized` &rarr; Compose plugin not installed.
3. `podman : The term 'podman' is not recognized` &rarr; Podman not installed.
4. `wsl --status` &rarr; "The Windows Subsystem for Linux is not installed."
5. Native Windows C-extensions &rarr; Windows Defender Application Control (WDAC) blocks user-space `.pyd` native libraries (`jaxlib/cpu_feature_guard.pyd`).
6. POSIX shell script &rarr; `docker-entrypoint.sh` cannot execute natively on Windows Win32 without a POSIX container/VM (`[WinError 193]`).

**Honest Assessment:** Live container execution cannot be run locally on this specific Windows laptop. It requires an unrestricted Linux runner or a host with Docker installed.

---

## 5. Backend Test Count Analysis & Strict Categorization

To avoid claiming unverified test counts, results are strictly distinguished by source:

1. **Historical Staging Results (Delivery Logs):**
   - Initial delivery: 209 passed offline tests, 42 deselected (`model` marker).
   - Hardening milestone (`9be6ea9`): +9 entrypoint tests &rarr; **218 passed, 3 deselected in 48.72s** on Debian 12 Linux container.
2. **Static AST Analysis (Code Structure):**
   - **230 test function definitions** (`def test_*`) across 29 test files in `shield-backend/tests/`.
3. **Local Pytest Collection (Windows Environment):**
   - **211 test items collected** across 23 non-JAX test files (`pytest --collect-only -q`).
   - **Collection halted with code 1** when importing 6 JAX-dependent test files (`test_embeddings_and_robustness.py`, `test_api_skeleton.py`, `test_cloak.py`, `test_components.py`, `test_engine.py`, `test_ssim_jax.py`) due to WDAC policy blocking `jaxlib/cpu_feature_guard.pyd`.
   - Therefore, the complete offline test collection count cannot be verified locally on this Windows host.
4. **CI-Executed Test Results (Pending):**
   - The exact count of passed and deselected test items will be dynamically evaluated by `pytest -q -m "not model"` when the GitHub Actions workflow executes on Ubuntu.
   - The workflow uses pytest's actual return status (`exit 0`) without enforcing a brittle hardcoded count assertion.

---

## 6. Python Dependency Audit

Inspection of all four requirement files:
- `requirements.txt`: FastAPI (>=0.110), Uvicorn (>=0.29), Pydantic (>=2.6), Pydantic-Settings (>=2.2), python-multipart (>=0.0.9), Pillow (>=10.0), NumPy (>=1.26).
- `requirements-ml.txt`: JAX (>=0.4.30), jaxlib (>=0.4.30), h5py (>=3.10). While CPU-oriented and free of massive multi-gigabyte CUDA runtime packages, JAX and jaxlib are substantial compiled C++/XLA dependencies (~80 MB wheel download, substantial runtime memory footprint, and native OS binary requirements).
- `requirements-video.txt`: OpenCV Headless (`opencv-python-headless>=4.8`) for video temporal optical flow.
- `requirements-dev.txt`: `-r requirements.txt`, pytest (>=8.0), httpx (>=0.27), scikit-image (>=0.22) (independent SSIM verification reference).

### Audit Findings & Installation Optimization:
1. **Redundant Specification:** `requirements-dev.txt` already includes `-r requirements.txt`. Passing both on the pip CLI is redundant. The workflow specifies:
   `pip install -r shield-backend/requirements-dev.txt -r shield-backend/requirements-ml.txt -r shield-backend/requirements-video.txt`.
2. **Dependency Necessity:** All four files are genuinely required for the backend offline unit test suite. Omitting `requirements-ml.txt` causes JAX import errors; omitting `requirements-video.txt` breaks optical flow and video tests; omitting `scikit-image` breaks SSIM crosscheck tests.
3. **Compiled ML Stack Footprint:** PyTorch was evaluated and rejected due to multi-gigabyte CUDA runtime requirements. While JAX and jaxlib are constrained to CPU-oriented wheels without CUDA libraries, they remain substantial compiled C++/XLA dependencies that carry non-trivial import overhead, native OS binary requirements, and JIT compilation cost, rather than being simple or lightweight pure-Python packages.
4. **No Dependencies Removed:** No test dependencies were removed, preserving full test integrity.

---

## 7. Automated GitHub Actions Validation Pipeline

To satisfy the requirement of testing the real Docker image on an Ubuntu runner without committing to `main` or deploying, an automated validation workflow has been prepared:

**Workflow File:** `.github/workflows/docker-validation.yml`
*(Prepared locally in working tree; not yet committed or pushed pending owner approval)*

### Workflow Highlights:
- **Narrowly Scoped Triggers:**
  * `push` trigger strictly scoped to branch `feature/ai-shield-staging` on paths `'shield-backend/**'` and `'.github/workflows/docker-validation.yml'`.
  * Does NOT trigger on `main`.
  * Does NOT trigger on pull requests.
  * Contains NO deployment triggers.
  * Retains `workflow_dispatch` for post-merge manual runs (with explicit commentary explaining GitHub's default-branch requirement).
- **Environment:** `ubuntu-latest` (official GitHub Linux runner with Docker pre-installed).
- **Execution Steps:**
  1. Builds real image: `docker build -t ghosting-shield:staging ./shield-backend`.
  2. Verifies non-root user `shield` (UID 10001).
  3. **Strict Negative Security Check (Proxy):** Asserts exit code `!= 0` AND checks stderr for exact rejection string: `"ERROR: SHIELD_FORWARDED_ALLOW_IPS='*' is not permitted."`.
  4. **Strict Negative Security Check (Auth Disabled):** Asserts exit code `!= 0` AND checks output for `"Refusing to start: SHIELD_PRODUCTION_MODE requires SHIELD_AUTH_MODE=api_key."`.
  5. **Strict Negative Security Check (Auth Open):** Asserts exit code `!= 0` AND checks output for `"Refusing to start: SHIELD_PRODUCTION_MODE refuses unauthenticated SHIELD_AUTH_MODE=open."`.
  6. **Strict Negative Security Check (Missing Digests):** Asserts exit code `!= 0` AND checks output for `"Refusing to start: no API key digests are configured."`.
  7. **Development Mode Smoke Test:** Boots container with `auth_mode=open`, verifies `/health` response.
  8. **Production Mode Runtime Verification:**
     * Verifies `/health` returns `status: ok`, `auth_mode: api_key`, `production_mode: true`.
     * Verifies public `/capabilities` returns `access_key_required: true` and header `X-API-Key`.
     * Verifies protected endpoint `POST /engines/style_shield/jobs` without key &rarr; returns **HTTP 401** with code `"auth_required"`.
     * Verifies protected endpoint `POST /engines/style_shield/jobs` with invalid key &rarr; returns **HTTP 401** with code `"auth_required"`.
     * Verifies protected endpoint `POST /engines/style_shield/jobs` with valid key &rarr; returns **HTTP 422** with code `"invalid_request"` (confirms authentication passed and route parameter validation was reached).
     * Verifies protected read route `GET /jobs/{job_id}` with valid key &rarr; returns **HTTP 404** with code `"job_not_found"` (confirms authentication passed and job manager was reached).
  9. **Runner-Level Backend Offline Tests:** Installs `requirements-dev.txt`, FFmpeg, and executes `pytest -q -m "not model"` cleanly on the runner.
  10. **Reordered Failure Diagnostics & Cleanup:**
      * `Dump Container Logs on Failure` (`if: failure()`) executes **BEFORE** cleanup.
      * `Cleanup Test Containers` (`if: always()`) executes **AFTER** diagnostics.
- **Zero Publishing / Zero Deployment:** Never pushes to Docker Hub, never deploys to production, uses no external paid APIs, and leaks zero secrets.

---

## 8. Outstanding Blockers Before Production Deployment

1. **Live Container Execution on Docker Host:**
   - The Dockerfile and Compose setup are structurally verified, but the automated GitHub Actions workflow or a Docker-capable staging host must execute the image build and runtime tests before production deployment.
2. **MobileNetV1 Pre-Trained Weights License (Critical Legal Blocker):**
   - Pre-trained weights file `mobilenet_1_0_224_tf_no_top.h5` lacks explicit commercial grant.
   - Enforced in code: `licence_confirmed = False` in `weights.py`.
   - Resolution: Send inquiry in `docs/ai-shield/MOBILENETV1_LICENCE_REQUEST.md` to `opensource@google.com` or migrate to a verified permissive backbone (e.g., MobileNetV3 BSD-3-Clause).
3. **Model Inference Efficacy (Scientific Limitation):**
   - Adversarial perturbation engine effectiveness has not been benchmarked against modern vision architectures (ViT, CLIP). Service description correctly notes: "Protection is not guaranteed and is not verified against all models."
4. **Face Shield Unimplemented (Functional Limitation):**
   - Face Shield is a placeholder stub; only Style Shield is currently functional.
