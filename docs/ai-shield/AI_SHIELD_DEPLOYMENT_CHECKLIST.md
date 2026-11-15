# AI Shield — Deployment Checklist

Branch `feature/ai-shield-staging`. Complete every item in order. No shortcuts.

## 0. Prerequisites (must be true before anything else)
- [ ] MobileNetV1 checkpoint licence resolved (or backbone replaced)
- [ ] Owner has reviewed and approved this branch for staging

## 1. Backend host
- [ ] Provision a single-instance host (min 2 vCPU, 4 GB RAM; see DEPLOYMENT.md for sizing caveats)
- [ ] Install Docker on the host
- [ ] `docker build -t ghosting-shield .` succeeds from `shield-backend/`
- [ ] `docker run --rm -p 8080:8080 -e SHIELD_AUTH_MODE=disabled ghosting-shield` starts without error
- [ ] `curl http://localhost:8080/health` returns `{"status":"ok",...}`
- [ ] `curl http://localhost:8080/capabilities | python3 -m json.tool` shows `image.ready: false` (no weights yet)

## 2. Model weights
- [ ] Obtain verified weights: `mobilenet_1_0_224_tf_no_top.h5`, SHA-256 matches `app/engines/style_shield/weights.py`
- [ ] Place at `/app/models/mobilenet_1_0_224_tf_no_top.h5` inside the container (mount volume, do not bake into image)
- [ ] `curl /capabilities` now shows `image.ready: true`
- [ ] `pytest -m model` from `shield-backend/` passes (requires `--workers 1` uvicorn running locally)

## 3. Staging environment file
```bash
# shield-backend/.env (never commit)
SHIELD_PRODUCTION_MODE=true
SHIELD_AUTH_MODE=api_key            # or open if protected by upstream WAF/CAPTCHA
SHIELD_API_KEY_SHA256=<sha256 of your staging key>
SHIELD_CORS_ORIGINS=https://staging.ghosting.site
SHIELD_JOB_DIR=/data/jobs
SHIELD_LOG_LEVEL=INFO
SHIELD_ALLOW_WEIGHT_DOWNLOAD=false
SHIELD_IMAGE_INPUT_POLICY=lossless_only
SHIELD_MAX_UPLOAD_MB=15
SHIELD_VIDEO_ENABLED=true
SHIELD_VIDEO_MAX_UPLOAD_MB=50
SHIELD_VIDEO_MAX_DURATION_S=10
SHIELD_VIDEO_MAX_KEYFRAMES=4
SHIELD_JOB_TTL_SECONDS=3600
```
- [ ] `.env` created from `.env.example`, not committed to git
- [ ] `docker compose up` starts cleanly with this env file
- [ ] `curl /health` from outside the container returns 200 via HTTPS

## 4. TLS and proxy
- [ ] HTTPS termination configured at the edge (Caddy, nginx, Fly.io, etc.)
- [ ] `X-Forwarded-For` stripped/replaced by the proxy (not user-controllable)
- [ ] Request body limit ≥ 55 MB at the proxy for `/video/jobs`
- [ ] Read timeout ≥ 120 s for `/engines/style_shield/jobs` and `/video/jobs`
- [ ] `/docs` and `/redoc` blocked at the proxy in production (optional but recommended)

## 5. Website build and deploy
- [ ] Add `VITE_SHIELD_API_URL=https://<backend>` as a GitHub Actions repository variable
- [ ] Edit `.github/workflows/deploy-pages.yml` build step to pass `VITE_SHIELD_API_URL` as `env:`
- [ ] Trigger a build; verify `dist/index.html` contains `connect-src https://<backend>`
- [ ] `#/ai-shield` loads; "This feature uploads your file to a server" disclosure shown
- [ ] Uploads disabled until consent checkbox ticked
- [ ] Image Shield tab: "Image Shield is unavailable: Model weights..." shown if weights absent
- [ ] Video Shield tab: limits (10 s, etc.) visible

## 6. Functional smoke test (do not use real user data)
- [ ] Upload a small synthetic PNG → job completes → download → delete
- [ ] Upload a 2 s synthetic MP4 → job completes → record shows `audio.present`
- [ ] Open job URL in a second browser with no token → 404
- [ ] "Delete from server" → job dir removed, GET output → 404
- [ ] Record shows `effectiveness: null` and `EXPERIMENTAL` in status_note

## 7. Security checks
- [ ] `trivy image ghosting-shield` — no critical CVEs
- [ ] `pip-audit` from `shield-backend/` — review findings
- [ ] `npm audit` from `website/` — review findings
- [ ] CORS: request from a different origin returns no `access-control-allow-origin` header
- [ ] `SHIELD_CORS_ORIGINS=*` refused at startup (ValidationError)

## 8. Privacy and legal
- [ ] Privacy Policy updated with hosting provider name and their log-retention policy
- [ ] Owner has decided on Home page "Zero Network Calls" copy scope
- [ ] Confirm TTL value in Privacy Policy matches `SHIELD_JOB_TTL_SECONDS` live value

## 9. Merge gate
- [ ] All items above checked
- [ ] Owner signs off on staging results
- [ ] PR opened from `feature/ai-shield-staging` → `main` with this checklist attached
