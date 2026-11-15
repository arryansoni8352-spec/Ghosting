# GHOSTING AI Shield — Antigravity handoff

Repo state: working tree of `arryansoni8352-spec/Ghosting` at `main` = `68e8c74` (re-fetched, unchanged) **plus uncommitted
changes**. Nothing was committed, pushed, released or deployed.

## 0. Read first — decisions and blockers
1. **Weights were auto-downloaded once during my baseline test run** (the original code downloads on first use). I deleted
   them from the sandbox; they are not in this package. The new code defaults to `SHIELD_ALLOW_WEIGHT_DOWNLOAD=false`.
2. **MobileNetV1 licence unresolved** → real Image/Video Shield runs were never executed; 42 model tests not run.
3. **Effectiveness unproven** (prior null result). Video transfer-of-perturbation is untested. UI says so everywhere.
4. Docker image written, **not built**.
5. Default temporal mode is `static`: `flow` did not help in measurements (research-limitations §2).

## 1. Files

### Created — backend (`shield-backend/`, the supplied zip, re-homed; manifest verified before edits)
`Dockerfile`, `.dockerignore`, `docker-compose.yml`, `requirements-video.txt`, `scripts/evaluate_video_temporal.py`,
`app/api/routes_capabilities.py`, `app/api/routes_video.py`, `app/schemas/video.py`,
`app/video/{__init__,limits,signature,ffmpeg,probe,scenes,temporal,protector,pipeline}.py`,
`tests/api/test_logging_privacy.py`, `tests/api/test_ownership_and_policy.py`,
`tests/video/{__init__,conftest,test_probe_validation,test_pipeline,test_temporal,test_ffmpeg_safety,test_video_api,test_video_model_integration}.py`
### Modified — backend (relative to the zip)
`.env.example`, `app/main.py`, `app/api/{middleware,routes_engines,routes_jobs}.py`, `app/config/settings.py`,
`app/core/{errors,jobs,security}.py`, `app/engines/style_shield/engine.py`, `app/schemas/protect.py`, `app/utils/images.py`,
`tests/api/{conftest,test_jobs_and_options,test_security}.py`
(The zip's own README/docs still describe the old behaviour, e.g. auto-download; they were left as research records.)

### Created — website
`website/src/pages/AIShieldPage.tsx`, `website/src/components/shield/{ShieldPrimitives,ConsentPanel,CompareView,ImageShield,VideoShield}.tsx`,
`website/src/lib/{shieldApi,shieldTypes,shieldValidation,useShieldJob}.ts`, `website/src/vite-env.d.ts`, `website/.env.example`,
`website/tests/{shieldValidation.test.ts,shieldApi.test.ts,aiShieldPage.test.tsx}`
### Modified — website
`src/App.tsx` (route `#/ai-shield`), `src/components/Navbar.tsx` (nav item), `src/components/Footer.tsx`,
`src/pages/{AboutPage,SecurityPolicyPage,PrivacyPolicyPage}.tsx` (claims qualified; AI Shield privacy section),
`tailwind.config.js` (additive `mint` colour), `vite.config.ts` (CSP `connect-src` from `VITE_SHIELD_API_URL`)
### Docs (`docs/ai-shield/`)
The eight `GHOSTING_AI_SHIELD_*.md` files. **Untouched:** `apps/`, `engine/`, `packages/`, Video Studio, Privacy Tools,
the GitHub workflow, root `PRIVACY.md`/`SECURITY.md`.

## 2. Install
```bash
# backend (Python 3.12 tested; FFmpeg >= 5.1 + ffprobe on PATH)
cd shield-backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-ml.txt -r requirements-video.txt -r requirements-dev.txt
# website
cd ../website && npm ci
```

## 3. Run locally
```bash
# terminal 1: backend (dev: no auth, CORS for Vite)
cd shield-backend
SHIELD_CORS_ORIGINS=http://localhost:5173 SHIELD_JOB_DIR=/tmp/shield-jobs \
  uvicorn app.main:app --host 127.0.0.1 --port 8080 --workers 1
# terminal 2: website
cd website && VITE_SHIELD_API_URL=http://127.0.0.1:8080 npm run dev     # open http://localhost:5173/#/ai-shield
```
Without weights the page honestly shows "Image Shield is unavailable". For a dev-only trial with real weights, you must
decide on the licence risk yourself, then `SHIELD_ALLOW_WEIGHT_DOWNLOAD=true` (production mode off).

## 4. Environment variables
Backend: all in `shield-backend/.env.example` (auth mode, API-key digests, production mode, rate limits, CORS origins,
weight download switch, device, queue/timeout/TTL, image policy and limits, every `SHIELD_VIDEO_*` limit, ffmpeg paths).
Frontend: `VITE_SHIELD_API_URL` (build-time; empty = feature disabled and CSP stays `connect-src 'none'`).

## 5. Connect frontend ↔ backend
1. Backend: `SHIELD_CORS_ORIGINS=<site origin>` (exact origin, no wildcard).
2. Frontend build: `VITE_SHIELD_API_URL=<backend origin>`.
3. If `SHIELD_AUTH_MODE=api_key`, the page shows an access-key box (typed by the user; never in JS).
4. Verify `GET <backend>/capabilities` from the browser console of the site (CORS) returns 200.

## 6. Tests and build
```bash
cd shield-backend && pytest -m "not model" -p no:cacheprovider       # expect 209 passed, 42 deselected
python -m scripts.evaluate_video_temporal                            # reproduces research-limitations §2 numbers
cd ../website && npx vitest run && npm run build                     # expect 130 passed; build OK
```
`pytest -m model` **downloads weights if absent** — do not run until the licence decision is made.

## 7. Production build
`cd website && VITE_SHIELD_API_URL=https://<backend> npm run build` → `dist/` (GitHub Pages). Backend: `docker build` per the
deployment doc. See `GHOSTING_AI_SHIELD_DEPLOYMENT.md` (topology, sizing caveats, proxy requirements, smoke test, rollback).

## 8. Known blockers / open items
- Licence of the MobileNetV1 checkpoint (or swap the backbone).
- Real-engine verification and performance/memory measurement on the chosen host.
- Docker build/run verification; seccomp/gVisor decision for ffmpeg.
- Abuse control for a public launch (access key, WAF/CAPTCHA); in-memory single-worker limitation.
- Home page copy "Zero Network Calls" still reads as site-wide; Home.tsx and its test were left as is.
- `pip-audit`/`npm audit` not run; no real-browser/mobile visual QA; no screen-reader testing.
- Zip's own README/docs not rewritten.

## 9. Deployment steps (after approval)
1. Resolve weights licence → decide provisioning (mounted volume).
2. Choose host; deploy ONE instance; set env from `.env.example` (production mode, CORS, auth).
3. Smoke-test backend (`/health`, `/capabilities`).
4. Add repo variable `VITE_SHIELD_API_URL`; edit `deploy-pages.yml` to pass it to the build step (not done).
5. Update live Privacy Policy with hosting provider/region and proxy-log retention.
6. Run the deployment doc's smoke test; keep rollback ready.

## 10. Needs YOUR approval (not done)
Commit/push · changing `.github/workflows/deploy-pages.yml` · choosing/paying for hosting and creating credentials ·
deploying the backend or the site · downloading or distributing model weights / resolving the licence · Home-page and
Privacy Policy wording changes (names of providers, "Zero Network Calls" scope) · enabling `open` auth in production.
