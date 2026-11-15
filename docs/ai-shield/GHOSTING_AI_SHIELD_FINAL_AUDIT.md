# GHOSTING AI Shield — Final Audit

**Date of audit:** November 14 2026
**Repo state:** `arryansoni8352-spec/Ghosting` at `main` = `68e8c74` (re-fetched this session, unchanged)
**Deliverable:** `ghosting-ai-shield-delivery.zip` (239 files) + `ghosting-website-changes.patch`
**Auditor:** Independent pass on all security-sensitive code paths. All tests re-run from a clean state.

---

## 1. Executive summary

The implementation is **substantially complete and internally honest** about its experimental status.
The core engineering (FastAPI backend, job ownership, rate limiting, file validation, FFmpeg pipeline,
temporal-consistency measurement, website integration, eight documentation files) is present and all 339
tests pass (209 backend offline, 130 website). No test results were fabricated or carried over from memory.

**Three issues require resolution before public launch:**
1. The MobileNetV1 checkpoint licence is unresolved → real Image Shield and Video Shield cannot run legally in
   production today (enforced in code; the page shows an honest error).
2. `SHIELD_CORS_ORIGINS` accepts `*` without validation → an operator misconfiguration would open the API to
   any browser origin. A one-line Pydantic validator fixes it.
3. The website patch does **not** apply to the unmodified `main` branch from a clean `git apply`; the changes
   exist correctly only in the working tree. For integration, Antigravity must use the files in the ZIP,
   not the patch. *(Update: re-tested after stashing — the patch applies cleanly to the bare `main` tree.
   The confusion arose because the working tree already had the changes applied. PASS.)*

One medium-severity operational finding: `CORS_ORIGINS=*` is accepted by settings without rejection.
Everything else is Low or informational.

**Completion status by component (see §13 for weighting rationale):**

| Component | Status | Blocking a launch? |
|---|---|---|
| Backend API (all endpoints) | PASS | No |
| Job ownership and token security | PASS | No |
| Rate limiting (upload + read) | PASS | No |
| Upload validation (image) | PASS | No |
| Upload validation (video, pre-queue) | PASS | No |
| Security headers | PASS | No |
| Logging hygiene | PASS | No |
| Image Shield engine integration | PARTIAL — implemented, honest 503 when no weights | Yes (weights/licence) |
| Video Shield pipeline | PARTIAL — implemented and all pipeline tests pass; real-engine runs never executed | Yes (same) |
| Temporal consistency | PASS (measured on synthetic clips) | No |
| Audio preservation and sync | PASS (tested with real FFmpeg) | No |
| Website page and tabs | PASS | No |
| Consent disclosure | PASS | No |
| Privacy copy in existing pages | PASS | No |
| CSP connect-src | PASS | No |
| Docker files | PARTIAL — written, never built | No (build it before deploying) |
| Model weights available | FAIL — not provided, licence unresolved | Yes |
| CORS wildcard validation | FAIL — settings accept `*` | Medium (operator risk) |
| Real-engine image test | NOT TESTED | Yes (licence first) |
| Real-engine video test | NOT TESTED | Yes (licence first) |
| Browser E2E / visual QA | NOT TESTED | No (nice-to-have) |
| Load / DoS testing | NOT TESTED | No (nice-to-have) |

---

## 2. Architecture overview

```
 GitHub Pages (static, unchanged deployment)         Separately hosted container (new)
┌─────────────────────────────────────┐  HTTPS      ┌──────────────────────────────────────────┐
│ website/ (React 19 + Vite)          │ ──────────► │ shield-backend/ (FastAPI, 1 worker)       │
│  #/ai-shield page (new)             │  X-Job-Token│  POST /engines/style_shield/jobs (image)  │
│  VITE_SHIELD_API_URL (build-time)   │  X-API-Key  │  POST /video/jobs (video, experimental)  │
│  CSP connect-src = that origin only │  (optional) │  GET /jobs/{id}  (status/output/record)   │
│  All other pages: untouched         │             │  GET /capabilities                         │
└─────────────────────────────────────┘             │  core/jobs.py: in-memory TTL queue        │
                                                    │  engines/style_shield: JAX (zip)           │
                                                    │  video/: FFmpeg pipeline                   │
                                                    └──────────────────────────────────────────┘

VeilGuard Electron app + engine/ (PyTorch PGD): completely untouched.
Video Studio (browser metadata tool): completely untouched.
```

The two AI protection engines (JAX/MobileNetV1 from the zip, and VeilGuard's PyTorch/ResNet-18) are kept
entirely separate in their own directories with no shared code.

---

## 3. File inventory

**New backend files (selected key paths):**
`app/api/routes_capabilities.py`, `app/api/routes_video.py`, `app/schemas/video.py`,
`app/video/{__init__, limits, signature, ffmpeg, probe, scenes, temporal, protector, pipeline}.py`,
`tests/video/{conftest, test_probe_validation, test_pipeline, test_temporal, test_ffmpeg_safety, test_video_api, test_video_model_integration}.py`,
`tests/api/{test_ownership_and_policy, test_logging_privacy}.py`,
`scripts/evaluate_video_temporal.py`, `Dockerfile`, `docker-compose.yml`, `.env.example`,
`requirements-video.txt`

**Modified backend files:**
`app/main.py`, `app/api/{middleware, routes_engines, routes_jobs}.py`, `app/config/settings.py`,
`app/core/{errors, jobs, security}.py`, `app/engines/style_shield/engine.py`,
`app/schemas/protect.py`, `app/utils/images.py`,
`tests/api/{conftest, test_jobs_and_options, test_security}.py`

**New website files:**
`src/pages/AIShieldPage.tsx`, `src/lib/{shieldApi, shieldTypes, shieldValidation, useShieldJob}.ts`,
`src/components/shield/{ShieldPrimitives, ConsentPanel, CompareView, ImageShield, VideoShield}.tsx`,
`tests/{shieldValidation.test.ts, shieldApi.test.ts, aiShieldPage.test.tsx}`,
`src/vite-env.d.ts`, `.env.example`

**Modified website files:**
`src/App.tsx`, `src/components/{Navbar, Footer}.tsx`,
`src/pages/{AboutPage, SecurityPolicyPage, PrivacyPolicyPage}.tsx`,
`tailwind.config.js`, `vite.config.ts`

**Documentation (new):**
`docs/ai-shield/GHOSTING_AI_SHIELD_{IMPLEMENTATION, API, DEPLOYMENT, PRIVACY, SECURITY,
RESEARCH_LIMITATIONS, TEST_REPORT, ANTIGRAVITY_HANDOFF}.md` (8 files)

**Untouched:** `apps/desktop/`, `engine/`, `packages/`, `website/src/pages/{VideoStudioPage,
PrivacyToolsPage, HomePage, AboutPage (structure unchanged)}.tsx`, `.github/workflows/deploy-pages.yml`

---

## 4. Backend findings

### Request validation — PASS
- `BodyLimitMiddleware`: checks `Content-Length` before reading; also counts streamed bytes; fires 413 before
  headers are sent. `app/api/middleware.py`.
- `read_bounded`: chunk-reads to a spooled file; discards partial oversized uploads. `app/utils/uploads.py`.
- Video probed from bytes before queueing (`probe_bytes` via tmp dir removed in `finally`). Container type
  determined from file bytes, not `Content-Type` or filename.
- Schema extras `forbid` on all option models; unknown fields return 422.
- Lossless-only image input enforced by walking RIFF chunks for `VP8L`, not trusting file extension.

### Job ownership — PASS
- 256-bit random token per job; only SHA-256 digest stored (`hmac.compare_digest` for constant-time compare).
- Token returned once; cleared from the job object immediately after.
- Wrong/missing token = same 404 as unknown job id (no existence oracle). Verified by 5 dedicated tests.
- Output route re-resolves path and checks `self._root in path.parents` before serving.
- Path containment check catches symlinks and `output_file` traversal from pipeline.

### Error handling — PASS
- All exceptions return JSON `{"error": "<code>", "message": "<client-safe text>"}`.
- ffmpeg stderr is never forwarded to clients; fixed strings only.
- No filesystem paths in status, record, capabilities, or health responses (verified by test).

### Queue depth — PASS
Active (queued + running) checked atomically under the manager lock before accepting a job.
Default: 1 concurrent, 4 queued.

### Logging hygiene — PASS
Application code logs only shortened job IDs. File names, tokens, full paths, and API keys are absent from
all log statements. Verified by `test_logging_privacy` with `caplog` capture.

---

## 5. Image Shield findings

### Engine integration — PARTIAL
The supplied JAX engine is integrated correctly. The readiness gate (`readiness()`) honestly reports
`model_not_installed` or `model_licence_unconfirmed` without attempting to load anything. Creating a job
when the engine is not ready returns 503 `model_unavailable` and creates no job. Verified end to end with
the real production-mode flag on.

**What was not verified:** any actual image was not protected. No model weights were available (they were
downloaded once during the initial baseline run and then deleted; the licence is unresolved). All 42
model-dependent tests are marked and were not run.

### Lossless input enforcement — PASS
PNG and lossless WebP (VP8L bitstream-detected) accepted. JPEG and lossy WebP rejected 400 at upload
with a plain-language explanation. Fail-fast lossy output check refuses 422 before queueing if H.264
codec distortion already exceeds the preset budget (tested with a high-noise image at q=95 JPEG).

### Budget preservation — PARTIAL (design correct, model side unverified)
The preset integer budgets (low 4, balanced 8, high 16 of 255) and re-verification after encoding are
present in the engine's existing code. The pipeline enforces this for video frames by construction
(`clip(frame + delta)`). The claim cannot be verified end-to-end without weights.

---

## 6. Video Shield findings

### Pipeline — PASS (synthetic only)
All 22 pipeline tests pass with real FFmpeg and a deterministic stub protector:
- Frame extraction, rotation, VFR detection and conversion, constant-fps enforcement.
- Audio: bit-exact copy when container allows it (AAC in MP4, Opus/Vorbis in WebM); AAC transcode when not.
- Audio/video synchronisation: start-offset preserved, duration checked; audio beginning before the first frame
  detected and reported.
- Scene-change detection triggers a perturbation reset.
- Lossless FFV1 output verified exact (budget satisfied). H.264 output honestly reports whether the budget
  was met; on a typical synthetic clip with budget=4, H.264 at CRF 16 reports `budget_satisfied=false`,
  max change 22 levels. The UI shows this plainly.
- All temporary files (frames, work dir, input copy) removed in `finally` on success, failure and cancel.

### FFmpeg subprocess safety — PASS
7 dedicated tests: list-only args (no shell), timeout, cancel-kill, no tool-output leak, env scrub, playlist
rejection. `shell=False` is set explicitly and never overridden. Environment passes only `PATH, LANG, LC_ALL,
TMPDIR, HOME`.

### Temporal consistency — PASS (measured on synthetic clips)
Measurements via `scripts/evaluate_video_temporal.py` (reproducible):
- Shared perturbation: flicker_excess = 0.00 (static camera), 0.06–0.11 (moving content).
- Independent per-frame noise baseline: 2.26–2.40.
- Optical-flow mode did not outperform static on any end-to-end scenario; default is `static`.
- Segment resets: visible (flicker_excess = 2.26 at the transition); hidden inside scene cuts.
- FFV1 lossless: budget satisfied, perturbation correlation = 1.0.

**What was not verified:** whether a keyframe's perturbation provides any protection to the other frames of
its segment, against any model. This is the central open question and has no data.

---

## 7. Frontend findings

### Integration — PASS
- `VITE_SHIELD_API_URL` absent → AI Shield shows an honest error, makes no network calls, CSP stays
  `connect-src 'none'`. Verified by test and production build.
- Consent checkbox gates all uploads; upload buttons disabled until ticked.
- Job status shows server-reported `progress` and `stage`; nothing simulated.
- Owner token stored in memory only (not `localStorage`, not URL). Access key in `sessionStorage` only.
  Verified by `test_keeps_the_access_key_in_sessionStorage_only`.
- `credentials: 'omit'`, `referrerPolicy: 'no-referrer'` on all requests.
- `pagehide` sends a keepalive DELETE to remove server files when the tab closes.

### Existing features — PASS
All 105 pre-existing website tests (Video Studio, Privacy Tools, navigation) pass unchanged.

### Visual design — NOT TESTED
Responsive Tailwind classes present; accessible ARIA roles/labels added. Not verified with a screen reader
or in a real browser.

---

## 8. Security findings

### Finding S1 — MEDIUM: CORS wildcard accepted without validation
**File:** `app/config/settings.py:72`
**Risk:** An operator who sets `SHIELD_CORS_ORIGINS=*` enables any website to make credentialed-free API
requests and read responses (rate limiting and job tokens would still apply; this is not critical, but it
removes an important defence-in-depth layer).
**Code:** `cors_origins: str = ""` — no validator; `cors_origin_list` splits on commas and passes `['*']`
directly to FastAPI's `CORSMiddleware`, which FastAPI/Starlette then treats as "allow all origins."
**Fix:** Add a Pydantic validator:
```python
@field_validator("cors_origins")
@classmethod
def no_wildcard(cls, v: str) -> str:
    if "*" in [o.strip() for o in v.split(",") if o.strip()]:
        raise ValueError("SHIELD_CORS_ORIGINS='*' is not permitted. List explicit origins.")
    return v
```

### Finding S2 — LOW: Content-Disposition filename not sanitised before Starlette
**File:** `app/core/jobs.py:280`, `app/video/pipeline.py` (filename construction)
**Risk:** Starlette's `FileResponse` URL-encodes the filename with `urllib.parse.quote`, which prevents
header injection. However, filenames derived from job IDs (image) or static strings (video) cannot contain
control characters anyway. The risk is theoretical but worth noting.
**Fix:** No code change required; document the behaviour.

### Finding S3 — LOW: `CORS_ORIGINS` empty = no CORS middleware, browsers still blocked
**Risk/note:** When `SHIELD_CORS_ORIGINS` is empty, no `CORSMiddleware` is added. Browsers enforce
same-origin policy; direct API calls from non-origin still work (curl, server-to-server). This is correct
behaviour but should be documented clearly for operators who expect "empty = deny all". **It does mean the
site cannot connect from a browser unless CORS is configured.** This is a deployment footgun, not a
security issue.

### Finding S4 — LOW: Body-limit middleware checks `Content-Length` as a digit string
**File:** `app/api/middleware.py`
**Code:** `if declared is not None and declared.isdigit() and int(declared) > self.max_bytes`
**Risk:** `Content-Length: -1` or `Content-Length: 1.5` does not match `isdigit()` and falls through to
the streaming counter, which is correct. A `Content-Length: 0` with a large body still triggers the
streaming counter. No real risk; the streaming path works correctly.

### Finding S5 — INFORMATIONAL: Single-process in-memory state
Job ownership tokens, rate-limit buckets and the job queue live only in one process's memory. Restart loses
all job state. Running more than one uvicorn worker would break ownership (token from worker A, job on
worker B = 404). The Dockerfile pins `--workers 1`; this is documented but easy to override at the host.
**Risk if misconfigured:** jobs become unreachable (DoS); tokens cross workers (security boundary lost).

### Finding S6 — INFORMATIONAL: ffmpeg/ffprobe CVEs
No CVE scan was performed. The Dockerfile pins Debian bookworm packages. Recommend `trivy image` before
any public deployment.

---

## 9. Test results

| Run | Command | Result |
|---|---|---|
| Backend offline | `pytest -m "not model" -p no:cacheprovider` | **209 passed, 42 deselected, 0 failed** (88.82 s) |
| Backend model tests | `pytest -m model` | **NOT RUN** — requires model weights (licence unresolved) |
| Website | `npx vitest run` | **130 passed, 14 test files, 0 failed** (16.21 s) |
| Website build (no backend) | `npm run build` | **✓ built in 7.28 s**, CSP `connect-src 'none'` |
| Website build (with backend) | `VITE_SHIELD_API_URL=https://shield.example.com npm run build` | **✓ built in 6.11 s**, CSP `connect-src https://shield.example.com` |
| Patch apply (bare tree) | `git stash && git apply --check patch` | **Applies cleanly** (all 8 file hunks) |

**Mock usage:** all 209 backend offline tests use a stub engine (`stub_engine` fixture: 20ms/step, deterministic
+/-1 noise, honours cancellation). No real JAX optimisation or model weights are involved. Video pipeline tests
use a `FakeProtector` (deterministic +/-4 noise) with real FFmpeg. The 42 deselected `model` tests would use real
weights. This is explicitly documented in test docstrings.

**New vs existing:** 121 tests carried over from the original zip (2 reclassified as `model`); 88 new tests added.

---

## 10. Licensing findings

**MobileNetV1 checkpoint (`mobilenet_1_0_224_tf_no_top.h5`, SHA-256 `9f9cfd8c...7829d3`):**
- Packaging code (fchollet/deep-learning-models): MIT ✓
- TensorFlow-Slim code (tensorflow/models): Apache-2.0 ✓
- **Checkpoint weights own licence: NOT LOCATED.** No explicit licence for the trained weight values was
  found at either the packaging repo or the original TensorFlow-Slim model zoo.
- **Commercial use: NOT ESTABLISHED.**
- **Redistribution: NOT ESTABLISHED.** (The weights are not in this project; they are downloaded from the
  original source by the user. That does not resolve whether using them in a service counts as redistribution
  under whatever licence applies.)
- **Status in code:** `licence_confirmed = False`; production mode refuses to load the engine; this is enforced
  in `app/engines/style_shield/weights.py` and `app/engines/style_shield/engine.py`. The gate cannot be bypassed
  without editing Python source.

**SqueezeNet v1.1 checkpoint (independent evaluator):** BSD-2-Clause ✓ (confirmed in original docs).

**Code and runtime dependencies:** all permissively licensed (MIT, Apache-2.0, BSD variants). Full table in
`shield-backend/docs/MODEL_LICENSING_REPORT.md`.

**Frontend dependencies:** standard React/Vite/Tailwind/TypeScript stack. No `npm audit` was run.

**Recommended action:** Contact the TensorFlow team (or file an issue on tensorflow/models) for an explicit
licence statement on the checkpoint. If none can be obtained, the alternative is to substitute a backbone whose
weights carry an explicit permissive licence (e.g., MobileNetV3 via torchvision under BSD-3-Clause, or a Keras
Application released under Apache-2.0 with explicit weight licence).

---

## 11. Website patch compatibility

**Result: PASS (applies cleanly).**

Tested procedure: `git stash` (restore bare `main`), `git apply --check /path/to/ghosting-website-changes.patch`,
`git stash pop`. All 8 file hunks applied without conflict. The earlier reported failure was a false alarm — the
working tree already had the changes from the build session, so `git apply` correctly refused a double-application.

**What the patch covers (8 files, all existing):**
`src/App.tsx` (route), `src/components/Navbar.tsx` (nav item), `src/components/Footer.tsx` (qualified claim),
`src/pages/AboutPage.tsx` (qualified claim), `src/pages/SecurityPolicyPage.tsx` (qualified claim),
`src/pages/PrivacyPolicyPage.tsx` (AI Shield privacy section added), `tailwind.config.js` (mint colours),
`vite.config.ts` (dynamic CSP from env, `loadEnv` import).

**What the patch does NOT cover (required separately — all in the ZIP):**
Every new file: `AIShieldPage.tsx`, all `src/lib/`, all `src/components/shield/`, `vite-env.d.ts`, `.env.example`,
all three new test files. These do not exist in the original repo and cannot be delivered as a patch.

**Integration method:** apply the patch to `main`, then copy the new files from the ZIP into the correct paths.
See §6 of the Antigravity handoff for exact commands.

---

## 12. Missing components

1. **Model weights** — not included, licence unresolved. The backend runs (all API endpoints respond), but
   real image or video protection cannot execute.
2. **Docker build verification** — Dockerfile written, never built. Must be verified before deployment.
3. **Real-engine performance measurement** — CPU time and memory per image/video job on the intended host are
   unknown. Limits in settings are conservative guesses.
4. **H.264 budget note in UI** — the `compatible` profile correctly reports `budget_satisfied_after_encoding`
   but the user sees a stat that often says "No". This is *correct and honest* but may confuse users. Consider
   a tooltip explaining why H.264 is offered at all (for preview playability; use lossless for exactness).
5. **Home page "Zero Network Calls" copy** — still reads as site-wide. Left intentionally for Aryan to decide.
6. **`deploy-pages.yml` unchanged** — the GitHub Actions workflow was not edited; the live site stays
   AI-Shield-free until a `VITE_SHIELD_API_URL` repository variable is added and the workflow is updated.
7. **`pip-audit` / `npm audit`** — not run.
8. **Accessibility audit with AT** — not performed.

---

## 13. Deployment readiness

**NOT ready for public launch.** Ready for staging/review.

The model licence is a hard blocker; without resolved weights the product page shows an honest error. Everything
else can be tested in staging while the licence question is pursued.

Deployment checklist:
- [ ] Resolve MobileNetV1 checkpoint licence (or swap backbone)
- [ ] Build and test Docker image (`docker build`, `docker compose up`, smoke test)
- [ ] Fix `CORS_ORIGINS=*` validator (S1, 3 lines)
- [ ] Choose and provision backend host (single instance, min 4 GB RAM, 2 vCPU)
- [ ] Place verified weights at `/app/models/mobilenet_1_0_224_tf_no_top.h5`
- [ ] Run `pytest -m model` to verify real-engine runs
- [ ] Measure CPU/memory per real job; adjust `SHIELD_JOB_TIMEOUT_SECONDS`, `SHIELD_VIDEO_MAX_KEYFRAMES`
- [ ] Set `SHIELD_PRODUCTION_MODE=true`, `SHIELD_AUTH_MODE`, `SHIELD_CORS_ORIGINS`
- [ ] Add `VITE_SHIELD_API_URL` to GitHub repository variables; edit `deploy-pages.yml` to pass it
- [ ] Update live Privacy Policy with hosting provider name and proxy-log policy
- [ ] Run deployment smoke test (capabilities, one image job, one video job, ownership check)
- [ ] Run `trivy image ghosting-shield` before exposing publicly
- [ ] Decide Home-page "Zero Network Calls" copy scope

---

## 14. Critical blockers

| # | Blocker | Severity | Fix |
|---|---|---|---|
| 1 | MobileNetV1 licence unresolved | **Critical** (legal) | Obtain explicit licence from TF-Slim, or replace backbone |
| 2 | No real-engine test run | **Critical** (technical) | Resolve #1, then `pytest -m model` |
| 3 | Docker image not built | **High** (deployment) | `docker build` on target host, verify `/health` |
| 4 | CORS wildcard accepted | **Medium** (config) | Add Pydantic validator (3 lines) |
| 5 | Host not provisioned | **High** (operational) | Choose provider, set env, deploy one instance |

---

## 15. Recommended fixes (in priority order)

1. **Add CORS wildcard validator** (`app/config/settings.py`): 3 lines of Pydantic code.
2. **Build the Docker image** and run `/health` + `/capabilities` to confirm the container starts.
3. **Resolve the licence** before any public deployment involving the model weights.
4. **Add a tooltip or info line** in the compatible-output stat explaining the budget-unsatisfied result.
5. **Run `pip-audit`** (backend) and `npm audit` (website) before exposing to the internet.
6. **Update `deploy-pages.yml`** to pass `VITE_SHIELD_API_URL` once the backend is live.
