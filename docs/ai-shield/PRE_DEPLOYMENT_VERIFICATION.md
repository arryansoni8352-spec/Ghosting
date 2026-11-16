# Pre-Deployment Verification Report

**Branch:** `feature/ai-shield-staging` (commits `8aad3e1`, `cc9b431` ahead of `main` = `68e8c74`)
**Date:** 2026-11-15  **Status:** Staged. NOT deployed. NOT pushed.

---

## 1. Git integrity

| Check | Result | Detail |
|---|---|---|
| Commits ahead of main | ✓ 2 | `8aad3e1` (AI Shield), `cc9b431` (staging docs) |
| Files changed | ✓ 166 changed, 158 added, 8 modified, 0 deleted | All within `shield-backend/`, `website/`, `docs/ai-shield/` |
| Changes outside expected paths | ✓ NONE | `git diff --name-only` grep for files outside those three dirs: empty |
| VeilGuard desktop untouched | ✓ | `apps/`, `engine/`, `packages/`: 0 changed files |
| Existing website tests untouched | ✓ | `website/tests/videoStudio*`, `videoFormat*`, `videoMetadata*`, `navigationAndUi*`: 0 changes |
| `.github/workflows/` untouched | ✓ | `deploy-pages.yml` unchanged |
| Model weights committed | ✓ NONE | No `.h5`, `.pt`, `.pth`, `.onnx`, `.bin`, `.ckpt` in diff |
| `.gitignore` covers weights | ✓ | `models/`, `*.pt`, `*.pth`, `*.h5` listed |
| Secrets or credentials committed | ✓ NONE | Regex scan of all Python/TS/TSX/JSON/YAML diffs: 0 hits |
| Hardcoded non-example URLs | ✓ NONE | Only `shield.example.com`, `ghosting.site`, localhost, test domains |
| Backup/temp files in diff | ✓ NONE | No `.bak`, `.tmp`, `.orig`, `~` files |
| Working tree clean | ✓ | `git status --short`: empty |

---

## 2. Docker validation

Docker is not available in this sandbox. All checks are **static analysis + runtime simulation** via FastAPI TestClient against the same Python environment the Docker image would use.

### Dockerfile static analysis — 13/13 PASS
`FROM python:3.12-slim-bookworm` pinned · non-root `shield` user · `USER shield` before `CMD` ·
`--workers 1` · `--no-access-log` · `HEALTHCHECK` · no `COPY models` · empty `/app/models` created ·
`/data` created with `chown` · `EXPOSE 8080` · `read_only` compatible · `PIP_NO_CACHE_DIR=1`

### docker-compose.yml static analysis — 10/10 PASS
`read_only: true` · `cap_drop: [ALL]` · `no-new-privileges:true` · `tmpfs` for jobs (not persistent disk) ·
`mem_limit: 4g` · `cpus: 2` · `models:/app/models:ro` · `env_file: .env` (not `.env.example`) ·
`restart: unless-stopped` · no `network_mode: host`

### Production startup enforcement — PASS
Tested via TestClient `.enter()` (which runs the FastAPI lifespan):
- `SHIELD_PRODUCTION_MODE=true` + `SHIELD_AUTH_MODE=disabled` → `RuntimeError: Refusing to start: SHIELD_PRODUCTION_MODE requires SHIELD_AUTH_MODE=ap…`
- `SHIELD_PRODUCTION_MODE=true` + `SHIELD_AUTH_MODE=api_key` + empty digests → `RuntimeError: Refusing to start: no API key digests are configured.`
- `SHIELD_PRODUCTION_MODE=true` + `SHIELD_AUTH_MODE=api_key` + valid digest → starts cleanly

### Staging env simulation — PASS
Config: `auth_mode=api_key`, `cors_origins=https://staging.ghosting.site`, `production_mode=true`, `allow_weight_download=false`
- `/health` (no key) → 200 ✓ (load-balancer exempt)
- `POST /engines/style_shield/jobs` (no key) → 401 `auth_required` ✓
- `POST /engines/style_shield/jobs` (correct key) → 503 `model_unavailable` ✓
- `GET /capabilities` → `image.ready: false`, `readiness.code: model_licence_unconfirmed` ✓
- `GET /capabilities` → `third_party_services: []` ✓
- Security headers on all responses: `x-content-type-options: nosniff`, `cache-control: no-store` ✓

### Docker build — NOT EXECUTED
Docker binary unavailable in the authoring sandbox. Must be run on the target host before staging.
Expected command and verification:
```bash
cd shield-backend
docker build -t ghosting-shield:staging .
docker run --rm -p 8080:8080 \
  -e SHIELD_AUTH_MODE=api_key \
  -e SHIELD_API_KEY_SHA256=$(printf 'your-staging-key' | sha256sum | cut -d' ' -f1) \
  -e SHIELD_CORS_ORIGINS=https://staging.ghosting.site \
  -e SHIELD_PRODUCTION_MODE=true \
  ghosting-shield:staging &
sleep 5
curl -f http://localhost:8080/health
curl -f -H "X-API-Key: your-staging-key" http://localhost:8080/capabilities | python3 -m json.tool
```

---

## 3. Security validation

### pip-audit
Run: `pip-audit --desc --format=columns` from `shield-backend/`

**Result: 9 packages have CVEs, all TRANSITIVE / SYSTEM dependencies — 0 are direct AI Shield requirements.**

| Package | Severity | CVEs | In AI Shield requirements? | Exploitable via AI Shield? |
|---|---|---|---|---|
| `pypdf 5.9.0` | Medium–High | 40+ DoS/memory CVEs, fix ≥6.21.4 | **No** — transitive via `camelot-py` (system package) | No — AI Shield never parses PDF |
| `pdfkit 1.0.0` | High | CVE-2025-26240 (command injection) | **No** — orphaned system package | No — not imported by any shield code |
| `pyjwt 2.7.0` | Medium–High | Multiple, fix ≥2.14.0 | **No** — orphaned system package | No — AI Shield uses no JWT |
| `httplib2 0.20.4` | Medium | CVE-2026-59939 | **No** — transitive via `launchpadlib` (system) | No |
| `oauthlib 3.2.2` | Medium | CVE-2026-49265 | **No** — orphaned system package | No |
| `soupsieve 3.0.3` | Medium | ReDoS CVE-2026-126190, fix 4.0.0 | **No** — transitive via `markdownify`/`markitdown` (system) | No — not in shield code path |
| `setuptools 68.1.2` | High | Path traversal / RCE via `PackageIndex` | System package | No — `PackageIndex`/`easy_install` are not called at runtime |
| `wheel 0.42.0` | High | Path traversal via `unpack` | System package | No — `wheel.unpack` not called at runtime |
| `pip 24.0` | Medium | Multiple, fix ≥26.2 | System package | No — not at runtime |

**AI Shield's own requirements** (`requirements.txt`, `requirements-ml.txt`, `requirements-video.txt`):
`fastapi`, `uvicorn`, `pydantic`, `pydantic-settings`, `python-multipart`, `Pillow`, `numpy`, `jax/jaxlib`, `h5py`, `opencv-python-headless` — **none flagged by pip-audit.**

**Recommendation:** Pin `pypdf>=6.21.4` in requirements-dev if it is ever added as a direct dependency. The system packages are not under this project's control; the Docker image (Debian bookworm) will carry its own versions. Run `trivy image` on the built image to catch OS-level CVEs.

### npm audit
Run: `npm audit` from `website/`

**Result: 3 vulnerabilities (2 critical, 1 moderate) — ALL in `vitest` (devDependency only).**

| Package | Severity | CVE | In production build? |
|---|---|---|---|
| `tinypool` | Critical | GHSA-5gmw-xhrv-c9v3 | **NO** — devDep; 0 vitest files in `dist/` (verified) |
| `vitest` | Critical | via `@vitest/mocker` | **NO** — devDep only |
| `@vitest/mocker` | Moderate | GHSA-82fw-gwwq-j7x9 | **NO** — devDep only |

Fix available: `vitest@5.1.0` (major bump — breaking changes possible). None of these affect the production bundle served to users. Recommend upgrading vitest after checking test compatibility.

### CORS wildcard — PASS (fixed in previous session)
`Settings(cors_origins='*')` raises `ValidationError`. Verified by test.

### Authentication enforcement — PASS
`auth_mode=api_key` enforces `X-API-Key` on all protected routes. `/health` is exempt (required for load balancers). Rate limiting: separate upload (30/min) and read (600/min) token buckets.

### Upload validation — PASS
PNG/lossless WebP only by default. File signature (not Content-Type) checked. Size limits enforced by streaming middleware before route handler. Video: container signature, ffprobe codec/duration/dimension validation before queueing. Invalid: GIF → 400, oversized → 413, MP4 bad signature → 415.

### Logging hygiene — PASS
2 dedicated tests confirm file names, tokens, and paths absent from logs. Application logs only 8-character shortened job IDs. `--no-access-log` pinned in Dockerfile.

### Model weights — CONFIRMED ABSENT
No weight files in git. `.gitignore` covers all formats. `production_mode=true` enforces `model_licence_unconfirmed` gate in code.

### Temporary file cleanup — PASS
Video pipeline uses `finally` blocks to remove frame dirs, work dirs, and input copies. Failed/cancelled/deleted jobs have their directories removed. TTL sweep removes expired jobs. Verified: 0 leftover job dirs after failed upload tests.

---

## 4. Test results summary

| Suite | Command | Result |
|---|---|---|
| Backend offline | `pytest -m "not model" -q -p no:cacheprovider` | **209 passed, 42 deselected, 0 failed** |
| Website | `npx vitest run` | **130 passed, 14 files, 0 failed** |
| Build (no backend) | `npm run build` | **✓ 7.4 s**, `connect-src 'none'` |
| Build (with backend) | `VITE_SHIELD_API_URL=https://shield-staging.example.com npm run build` | **✓ 6.6 s**, `connect-src https://shield-staging.example.com` |
| `pytest -m model` | — | **NOT RUN** — licence unresolved |
| Docker build | — | **NOT EXECUTED** — Docker unavailable |

---

## 5. Final verdict

| Readiness level | Status | Blocking issues |
|---|---|---|
| **Ready for infrastructure staging** | ✓ YES (with caveats) | Docker build must be verified on target host; vitest should be updated |
| **Ready for real AI model testing** | ✗ NO | MobileNetV1 licence must be resolved first; `pytest -m model` never run |
| **Ready for public launch** | ✗ NO | Licence, Docker build, real-engine tests, performance measurement, `deploy-pages.yml` update, Privacy Policy with provider name, Home page copy decision |
