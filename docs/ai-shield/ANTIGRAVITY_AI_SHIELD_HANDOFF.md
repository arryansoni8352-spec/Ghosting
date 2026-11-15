# GHOSTING AI Shield — Antigravity Handoff

**Repo:** `arryansoni8352-spec/Ghosting` at `main` = `68e8c74` (do not assume `main` is static; re-fetch before work).
**Deliverable:** `ghosting-ai-shield-delivery.zip` (239 files) + `ghosting-website-changes.patch`.
**Status:** staged, not committed, not deployed. Nothing here touches production.

---

## 0. The two separate projects — keep them apart

| Project | Purpose | Location | Do NOT touch |
|---|---|---|---|
| **VeilGuard desktop app** | Electron app + local PyTorch engine | `apps/desktop/`, `engine/`, `packages/` | Entirely separate; no code paths shared with AI Shield |
| **AI Shield** | Web-hosted JAX image/video protection | `shield-backend/` (new), `website/src/lib/`, `website/src/components/shield/`, `website/src/pages/AIShieldPage.tsx` | Do not merge these two engines' algorithms |

---

## 1. Files Antigravity should use (from the ZIP)

### New backend files — copy to repo root as `shield-backend/`
```
shield-backend/
  app/
    __init__.py
    main.py
    api/
      middleware.py          routes_capabilities.py  routes_engines.py
      routes_health.py       routes_jobs.py          routes_models.py
      routes_video.py
    config/settings.py
    core/
      engine.py  errors.py  jobs.py  registry.py  security.py
    engines/style_shield/   (complete, from zip — do not modify)
    schemas/
      common.py  protect.py  video.py
    utils/
      images.py  uploads.py
    video/
      __init__.py  ffmpeg.py  limits.py  pipeline.py
      probe.py     protector.py  scenes.py  signature.py  temporal.py
  tests/
    api/
      conftest.py                    test_concurrency.py
      test_input_validation.py       test_jobs_and_options.py
      test_logging_privacy.py        test_ownership_and_policy.py
      test_security.py
    style_shield/   (complete, from zip)
    video/
      conftest.py                    test_ffmpeg_safety.py
      test_pipeline.py               test_probe_validation.py
      test_temporal.py               test_video_api.py
      test_video_model_integration.py
  scripts/
    evaluate_video_temporal.py
  Dockerfile
  docker-compose.yml
  .dockerignore
  .env.example
  pyproject.toml
  requirements.txt
  requirements-dev.txt
  requirements-ml.txt
  requirements-video.txt
  docs/   (from zip — research docs, unchanged from supplier)
```

### New website files — copy into `website/`
```
website/
  src/
    pages/
      AIShieldPage.tsx
    components/
      shield/
        ShieldPrimitives.tsx
        ConsentPanel.tsx
        CompareView.tsx
        ImageShield.tsx
        VideoShield.tsx
    lib/
      shieldApi.ts
      shieldTypes.ts
      shieldValidation.ts
      useShieldJob.ts
    vite-env.d.ts
  tests/
    shieldValidation.test.ts
    shieldApi.test.ts
    aiShieldPage.test.tsx
  .env.example
```

### Modified website files — apply via patch OR copy from working tree
The 8 existing files changed by this implementation:
`src/App.tsx`, `src/components/Navbar.tsx`, `src/components/Footer.tsx`,
`src/pages/AboutPage.tsx`, `src/pages/SecurityPolicyPage.tsx`, `src/pages/PrivacyPolicyPage.tsx`,
`tailwind.config.js`, `vite.config.ts`.

**Preferred method:** apply the patch:
```bash
# From the repo root, on a clean main branch:
git apply /path/to/ghosting-website-changes.patch
# Then copy the new files listed above from the ZIP.
```
Verified: applies cleanly to bare `main` = `68e8c74`. Fails if already applied (working tree has them).

---

## 2. Files Antigravity must NOT change

- `apps/desktop/`, `engine/`, `packages/` — VeilGuard desktop app; completely separate.
- `website/src/pages/{VideoStudioPage, PrivacyToolsPage, HomePage}.tsx` — existing tools, untouched.
- `website/tests/{videoStudio*, videoFormat*, videoMetadata*, videoProcessor*, navigationAndUi*}.test.{ts,tsx}` — existing tests.
- `.github/workflows/deploy-pages.yml` — intentionally not changed (see §6).
- `shield-backend/app/engines/style_shield/` (source from zip) — do not alter the JAX algorithm.
- `shield-backend/docs/` (supplier research docs) — do not alter; they document the null result.

---

## 3. Current architecture

```
GitHub Pages (static)                      Single-process container host
website/ → dist/ → CDN                     shield-backend/ → Docker image
  #/ai-shield page                           FastAPI, --workers 1 (mandatory)
  VITE_SHIELD_API_URL (build-time)           In-memory job queue + TTL cleanup
  connect-src = that origin only             JAX engine (no weights yet)
  All other pages: local-only               FFmpeg video pipeline
```

**Single-worker requirement is HARD:** job state (ownership tokens, progress, files) lives in one process's
memory. Running `--workers 2` or autoscaling above 1 instance breaks job ownership (token from instance A,
job on instance B = 404). The `Dockerfile CMD` pins `--workers 1`. Do not override this.

---

## 4. Required backend hosting configuration

```bash
# Minimum: set these before starting
SHIELD_PRODUCTION_MODE=true
SHIELD_AUTH_MODE=open            # or api_key if you want users to enter an access key
SHIELD_CORS_ORIGINS=https://ghosting.site   # exact origin, NOT *
SHIELD_JOB_DIR=/data/jobs        # backed by tmpfs in compose, or ephemeral host disk
SHIELD_LOG_LEVEL=INFO
SHIELD_ALLOW_WEIGHT_DOWNLOAD=false  # only flip to true after resolving the licence

# Sizing (see DEPLOYMENT doc for caveats — real-engine times are unmeasured):
SHIELD_MAX_CONCURRENT_JOBS=1
SHIELD_MAX_QUEUED_JOBS=4
SHIELD_JOB_TIMEOUT_SECONDS=1800
SHIELD_JOB_TTL_SECONDS=3600

# Image limits
SHIELD_IMAGE_INPUT_POLICY=lossless_only
SHIELD_MAX_UPLOAD_MB=15

# Video limits (defaults; tune after measuring real-engine speed)
SHIELD_VIDEO_ENABLED=true
SHIELD_VIDEO_MAX_UPLOAD_MB=50
SHIELD_VIDEO_MAX_DURATION_S=10
SHIELD_VIDEO_MAX_KEYFRAMES=4
```

Full list of every variable is in `shield-backend/.env.example`. Copy to `.env`; never commit it.

**Before fixing the CORS wildcard bug (S1 in audit §8):**
Add this to `app/config/settings.py` after the `cors_origins` field:
```python
@field_validator("cors_origins")
@classmethod
def no_wildcard(cls, v: str) -> str:
    if "*" in [o.strip() for o in v.split(",") if o.strip()]:
        raise ValueError("SHIELD_CORS_ORIGINS='*' is not permitted. Use explicit origins.")
    return v
```

---

## 5. Required frontend environment variables

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `VITE_SHIELD_API_URL` | Yes (feature on) | `https://shield.yourdomain.com` | Backend base URL. Empty = AI Shield disabled, CSP stays `connect-src 'none'`. |

Set as a GitHub Actions repository variable (`Settings → Secrets and variables → Variables`), then pass it
to the build step:
```yaml
# In .github/workflows/deploy-pages.yml, inside the build step:
env:
  VITE_SHIELD_API_URL: ${{ vars.VITE_SHIELD_API_URL }}
```
**This workflow edit was intentionally not made.** You must do it after the backend is live.

Build with backend:
```bash
VITE_SHIELD_API_URL=https://shield.yourdomain.com npm run build
# Verify CSP:
grep -o "connect-src[^;]*" dist/index.html
# → connect-src https://shield.yourdomain.com
```

---

## 6. API endpoints and formats

Base URL = `VITE_SHIELD_API_URL`. All responses: `Cache-Control: no-store`, security headers on every response.

**Health check:**
```
GET /health → 200 {"status":"ok", "version":"...", ...}
```

**Capabilities (what the server can do, with its limits):**
```
GET /capabilities → 200 {...}  # See GHOSTING_AI_SHIELD_API.md for full schema
# image.ready: false if no weights. image.readiness.code: model_not_installed | model_licence_unconfirmed | ready
```

**Create image job:**
```
POST /engines/style_shield/jobs
  Content-Type: multipart/form-data
  file: <PNG or lossless WebP>
  strength: low|balanced|high
  output_format: png|webp
  webp_lossless: true (if webp)
→ 202 { "job_id": "...", "owner_token": "SAVE THIS - shown once", "state": "queued", ... }
→ 400 unsupported_image (JPEG, lossy WebP)
→ 413 image_too_large
→ 422 budget_unsatisfiable (lossy output whose codec alone exceeds the budget)
→ 503 model_unavailable (no weights or licence unconfirmed)
```

**Create video job (experimental):**
```
POST /video/jobs
  Content-Type: multipart/form-data
  file: <MP4/MOV H.264 or WebM VP8/VP9>
  strength: low|balanced|high
  output_profile: compatible|lossless
  temporal_mode: static|flow
→ 202 { "job_id": "...", "owner_token": "...", "input": {...video metadata...} }
→ 415 unsupported_video (bad container/codec)
→ 400 video_corrupt
→ 413 video_limit_exceeded
→ 503 model_unavailable
```

**All job operations require `X-Job-Token: <owner_token>` header. Wrong/missing = 404.**
```
GET  /jobs/{id}         → 200 {state, stage, progress 0..1, error|null, output_available}
GET  /jobs/{id}/output  → 200 binary (image or video) with Content-Disposition
GET  /jobs/{id}/record  → 200 JSON (protection record; effectiveness: null always)
POST /jobs/{id}/cancel  → 202
DELETE /jobs/{id}       → 204 (removes all server-side data immediately)
```

**If `auth_mode=api_key`, also send `X-API-Key: <user-entered key>` on all requests.**

---

## 7. Installation and test commands

```bash
# Backend
cd shield-backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-ml.txt \
            -r requirements-video.txt -r requirements-dev.txt
# Verify FFmpeg is on PATH:
ffmpeg -version | head -1

# Backend tests (no weights needed, no model runs):
pytest -m "not model" -p no:cacheprovider
# Expected: 209 passed, 42 deselected, 0 failed

# Temporal consistency measurements (synthetic clips only):
python -m scripts.evaluate_video_temporal

# Website
cd ../website
npm ci
npx vitest run           # expected: 130 passed, 0 failed
npm run build            # expected: ✓ built, connect-src 'none'
VITE_SHIELD_API_URL=https://your-backend.example.com npm run build
grep -o "connect-src[^;]*" dist/index.html   # → connect-src https://your-backend.example.com

# Docker (once you have Docker):
cd shield-backend
docker build -t ghosting-shield .
docker run --rm -p 8080:8080 -e SHIELD_AUTH_MODE=disabled ghosting-shield &
curl http://localhost:8080/health
curl http://localhost:8080/capabilities | python3 -m json.tool | grep '"ready"'
```

---

## 8. Known issues

| # | Issue | File | Severity | Fix |
|---|---|---|---|---|
| 1 | MobileNetV1 licence unresolved | `app/engines/style_shield/weights.py:46` | **Critical** | Obtain licence or replace backbone |
| 2 | CORS wildcard not validated | `app/config/settings.py:72` | Medium | 3-line Pydantic validator (§4) |
| 3 | Docker never built | `Dockerfile` | High (deployment) | `docker build` on target host |
| 4 | Real-engine tests never run | `tests/` (all `model` marker) | High (verification) | Resolve licence first |
| 5 | H.264 output: `budget_satisfied=false` confuses users | `website/src/components/shield/VideoShield.tsx` | Low | Add tooltip |
| 6 | Home page "Zero Network Calls" reads as site-wide | `website/src/pages/HomePage.tsx` | Low | Owner decision |
| 7 | `deploy-pages.yml` not updated | `.github/workflows/deploy-pages.yml` | Operational | Add `VITE_SHIELD_API_URL` env var |

---

## 9. Required fixes before public launch

1. **Resolve MobileNetV1 checkpoint licence** (contact TF-Slim, or substitute a differently-licensed backbone).
2. **Add CORS wildcard validator** to `settings.py` (3 lines — see §4).
3. **Build the Docker image** and verify `/health` on the target platform.
4. **Run `pytest -m model`** after weights are available to verify real-engine image and video protection runs.
5. **Measure real-job CPU/memory** and tune `SHIELD_JOB_TIMEOUT_SECONDS`, `SHIELD_VIDEO_MAX_KEYFRAMES`,
   `SHIELD_MAX_QUEUED_JOBS` from actual observations.
6. **Update `deploy-pages.yml`** to pass `VITE_SHIELD_API_URL` (§5).
7. **Update live Privacy Policy** with the actual hosting provider name and their log-retention policy.
8. **Run `pip-audit` and `npm audit`**.

---

## 10. Integration order

1. Apply patch + copy new files (§1). Verify `npx vitest run` and `npm run build` still pass.
2. Fix the CORS validator (§4).
3. Stand up the backend: provision host, copy `shield-backend/`, copy `.env.example` → `.env`, edit.
4. `docker build` + smoke test (`/health`, `/capabilities`).
5. Resolve weights licence; place verified weights at `/app/models/mobilenet_1_0_224_tf_no_top.h5`.
6. `pytest -m model` (image and video real-engine tests).
7. Add `VITE_SHIELD_API_URL` repository variable; edit `deploy-pages.yml` (§5); rebuild site.
8. Manual smoke test from the browser: image job, video job, ownership check, delete.
9. `trivy image ghosting-shield` before public exposure.
10. Update Privacy Policy with provider name. Get owner approval on Home-page copy.

---

## 11. Acceptance criteria

The integration is complete when ALL of the following pass:

- [ ] `pytest -m "not model"` → 209 passed, 0 failed
- [ ] `pytest -m model` → at minimum `test_real_engine_on_a_tiny_clip` passes (requires weights)
- [ ] `npx vitest run` → 130 passed, 0 failed
- [ ] `npm run build` with `VITE_SHIELD_API_URL` set → builds, CSP contains exactly the backend origin
- [ ] `/capabilities` from the site's origin → 200, `image.ready: true`, `video.ready: true`
- [ ] One PNG uploaded → job completes, PNG downloaded, record shows `budget_satisfied_after_encoding: true`
- [ ] One MP4 (≤10 s, H.264+AAC) uploaded → job completes, output downloadable, `audio.present: true`
- [ ] Job accessed from a second browser without the token → 404
- [ ] "Delete from server" → job dir deleted, GET output → 404
- [ ] MobileNetV1 checkpoint has an explicit, documented licence
- [ ] CORS wildcard validator present in `settings.py`
- [ ] Privacy Policy names the hosting provider
- [ ] `trivy image ghosting-shield` returns no critical CVEs
