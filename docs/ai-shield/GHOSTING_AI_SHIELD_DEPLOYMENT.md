# GHOSTING AI Shield — Deployment

**Nothing has been deployed.** This is a runbook for you / Antigravity. Do not deploy before the approvals listed in
the handoff document.

## 1. Topology
- Website: unchanged GitHub Pages deployment of `website/` (static). Needs one build variable.
- Backend: `shield-backend/` in a container-capable host (Fly.io, Render, Railway, Cloud Run with min-instances=1 and
  concurrency 1, a VPS, etc.). GitHub Pages cannot host it. The URL is configuration, so the host can change later.
- **Exactly one process/instance.** Job state is in memory. Do not enable autoscaling above 1 instance or
  multi-worker mode; ownership checks and job lookups would break across processes.

## 2. Requirements (read this: sizing is **not benchmarked**)
| Resource | Baseline | Basis |
|---|---|---|
| CPU | 2 vCPU recommended, CPU-only (JAX CPU) | image + video tests ran on 1 vCPU/4 GB with a *stub* engine; **real-engine speed was never measured** (no weights). The supplied README reports roughly 70 s per 128 px image (balanced preset) on CPU, and larger images take longer. Expect video ≈ minutes × keyframes (max 4 by default). |
| RAM | 4 GB minimum, 8 GB safer | JAX + model + per-job arrays + queued uploads in memory (≤ 4 queued × up to 50 MB). Unmeasured under load. |
| Disk (job dir) | 2 GB | video frames: limit `SHIELD_VIDEO_MAX_TEMP_MB` (1024) per job; one concurrent job |
| GPU | optional, not required | `SHIELD_DEVICE=auto` would use one if JAX GPU is installed; not tested |
| ffmpeg/ffprobe | ≥ 5.1 on PATH | Debian bookworm package (installed by the Dockerfile) |

Measure first: run one real image and one real 4-keyframe video on the chosen instance before setting public limits,
and tune `SHIELD_JOB_TIMEOUT_SECONDS`, `SHIELD_VIDEO_MAX_KEYFRAMES`, `SHIELD_MAX_QUEUED_JOBS` from what you see.

## 3. Model weights (blocker)
The MobileNetV1 checkpoint licence is **unresolved**. Weights are not in git or the image. Until resolved:
- `SHIELD_PRODUCTION_MODE=true` makes the engine report `model_licence_unconfirmed` and refuse to run;
- with production mode off, an operator who accepts the risk can place verified weights in `/app/models` (the file name
  and SHA-256 are in `app/engines/style_shield/weights.py`) or set `SHIELD_ALLOW_WEIGHT_DOWNLOAD=true` for a first
  download. Weights downloaded this way were **never** part of this delivery.
- Heads-up: `tests/conftest.py::require_model_weights` (used by `pytest -m model`) downloads weights if absent.

Until this is resolved the website will honestly show "Image Shield is unavailable: Model weights are not installed".

## 4. Backend steps
```bash
cd shield-backend
cp .env.example .env        # edit: SHIELD_AUTH_MODE, SHIELD_CORS_ORIGINS=https://ghosting.site, limits
# local:
pip install -r requirements.txt -r requirements-ml.txt -r requirements-video.txt -r requirements-dev.txt
uvicorn app.main:app --host 127.0.0.1 --port 8080 --workers 1
# container:
docker build -t ghosting-shield . && docker compose up
curl -s http://127.0.0.1:8080/health ; curl -s http://127.0.0.1:8080/capabilities
```
Put it behind TLS (platform edge or reverse proxy). At the proxy: HTTPS only, request body limit ≥ 55 MB for `/video/jobs`,
read timeout ≥ 120 s for uploads, strip client-supplied `X-Forwarded-For`, optionally block `/docs`.

Production settings: `SHIELD_PRODUCTION_MODE=true`, `SHIELD_AUTH_MODE=api_key` (or `open` behind a WAF/CAPTCHA),
`SHIELD_CORS_ORIGINS=https://ghosting.site`, `SHIELD_DEVICE=cpu`. Logging: stderr, `SHIELD_LOG_LEVEL`. Cleanup:
`SHIELD_JOB_TTL_SECONDS`, expired jobs removed by a background sweep (`core/jobs.py`), leftover job dirs purged at startup. Storage: `SHIELD_JOB_DIR`
(tmpfs in compose). Health check: `GET /health` (used by the Dockerfile `HEALTHCHECK`).

## 5. Frontend steps
```bash
cd website
VITE_SHIELD_API_URL=https://shield.example.com npm ci && npm run build
```
The CSP `connect-src` is generated from that value (verified: `'none'` without it, exactly that origin with it).
The existing workflow `.github/workflows/deploy-pages.yml` builds without the variable, so **AI Shield stays disabled on
the live site until you add `VITE_SHIELD_API_URL` as a repository variable and pass it as `env:` to the build step**.
That workflow was deliberately not edited (it would change production).

## 6. Smoke test after deploying (you or Antigravity)
1. `/capabilities` → `image.ready` / `video.ready` as expected; `third_party_services` empty.
2. Website `#/ai-shield`: disclosure appears, upload disabled until ticked.
3. Small PNG → job completes → download → "Delete from server" → job 404.
4. Short MP4 with audio → completes → play processed MP4 → record shows budget statement.
5. From another browser/profile, request the job URL: must be 404.
6. Check provider logs for what they record; update the Privacy Policy accordingly.

## 7. Rollback
Remove `VITE_SHIELD_API_URL` and redeploy the site (feature disappears, CSP returns to `'none'`); stop the backend.
No data migration exists; jobs are ephemeral.
