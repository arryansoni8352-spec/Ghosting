# Staging Deployment Runbook

**Status:** Infrastructure staging ready. Real model testing blocked on licence.

---

## Infrastructure requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU (JAX cold-start + FFmpeg concurrent) |
| RAM | 4 GB | 8 GB |
| Disk (tmpfs for jobs) | 2 GB | 4 GB |
| OS | Linux x86-64 | Debian 12 / Ubuntu 22.04 |
| Docker | 24.x+ | 27.x+ |
| FFmpeg | 5.1+ (in image) | — |
| Network | HTTPS termination at edge | Reverse proxy (nginx/Caddy/Fly edge) |

Single instance only. Do not scale horizontally (in-memory job state).

---

## Environment setup

```bash
cd shield-backend
cp .env.example .env
# Edit .env:
SHIELD_PRODUCTION_MODE=true
SHIELD_AUTH_MODE=api_key
SHIELD_API_KEY_SHA256=$(printf 'your-staging-key-here' | sha256sum | cut -d' ' -f1)
SHIELD_CORS_ORIGINS=https://staging.ghosting.site
SHIELD_FORWARDED_ALLOW_IPS=         # set to your proxy's IP, e.g. 10.0.0.1
SHIELD_JOB_DIR=/data/jobs
SHIELD_LOG_LEVEL=INFO
SHIELD_ALLOW_WEIGHT_DOWNLOAD=false
```

---

## Docker build and start

```bash
# Build
cd shield-backend
docker build -t ghosting-shield:staging .

# Trivy security scan (do before exposing publicly)
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image ghosting-shield:staging

# Start (staging — no weights, honest error expected)
docker compose up -d

# Verify
docker compose ps
docker compose logs --tail 20
```

---

## Health-check procedure

```bash
# 1. Basic health (no auth required)
curl -sf http://127.0.0.1:8080/health | python3 -m json.tool
# expect: {"status":"ok","version":"..."}

# 2. Capabilities (auth required)
STAGING_KEY="your-staging-key-here"
curl -sf -H "X-API-Key: $STAGING_KEY" http://127.0.0.1:8080/capabilities \
  | python3 -m json.tool
# expect: image.ready=false, image.readiness.code=model_licence_unconfirmed
#         video.ffmpeg_available=true

# 3. Auth enforcement
curl -sf http://127.0.0.1:8080/capabilities
# expect: 401 auth_required
```

---

## Smoke tests (use synthetic files only — no real user data)

```bash
KEY="your-staging-key-here"
BASE="http://127.0.0.1:8080"

# a. PNG upload → honest 503 (no weights)
python3 -c "
from PIL import Image; import io
b=io.BytesIO(); Image.new('RGB',(48,48),(100,150,200)).save(b,'PNG'); b.seek(0)
import requests
r=requests.post(f'$BASE/engines/style_shield/jobs',
  files={'file':('test.png',b,'image/png')},
  data={'strength':'low'},
  headers={'X-API-Key':'$KEY'})
print(r.status_code, r.json()['error'])
"
# expect: 503 model_unavailable

# b. Bad signature
curl -sf -X POST -H "X-API-Key: $KEY" \
  -F "file=@/etc/hostname;type=image/png" \
  $BASE/engines/style_shield/jobs
# expect: 400 unsupported_image or 400 corrupt_image

# c. Job ownership (access with wrong token)
JOB_ID="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
curl -sf -H "X-API-Key: $KEY" -H "X-Job-Token: wrong" \
  $BASE/jobs/$JOB_ID
# expect: 404

# d. CORS wildcard blocked (verify in .env)
docker compose exec shield env | grep CORS
# expect: SHIELD_CORS_ORIGINS=https://staging.ghosting.site (not *)
```

---

## Data-retention verification

```bash
# Verify TTL setting
curl -sf -H "X-API-Key: $KEY" http://127.0.0.1:8080/capabilities \
  | python3 -c "import json,sys; c=json.load(sys.stdin); print('TTL:', c['retention']['job_ttl_seconds'], 's')"
# expect: TTL: 3600 s

# Verify job dir is on tmpfs (ephemeral)
docker compose exec shield df -h /data
# expect: tmpfs
```

---

## Frontend build (staging)

```bash
cd website
VITE_SHIELD_API_URL=https://staging-shield.yourdomain.com npm run build
grep -o "connect-src[^;]*" dist/index.html
# expect: connect-src https://staging-shield.yourdomain.com (not *)
```

Add `VITE_SHIELD_API_URL` as a GitHub Actions repository variable before the CI build.
Edit `.github/workflows/deploy-pages.yml` to pass it as `env:` in the build step.

---

## Rollback procedure

```bash
# 1. Remove backend URL from GitHub Actions variable → next build disables AI Shield
# 2. Stop the container: docker compose down
# 3. The live site will show "AI Shield is not enabled" after the next build
# No data migration needed — all job state is ephemeral (tmpfs)
```

---

## Troubleshooting

| Problem | Check | Fix |
|---|---|---|
| Container exits at start | `docker compose logs` | See `DOCKER_STAGING_READINESS.md` common failures |
| 401 on all API calls | Auth mode | Send `X-API-Key` header |
| 503 on jobs | Weights absent | Expected — licence gate |
| CORS error in browser | `SHIELD_CORS_ORIGINS` | Set to exact frontend origin |
| Rate limit 429 | >30 uploads/min from one IP | Adjust `SHIELD_RATE_LIMIT_PER_MINUTE` |
| `/health` timeout | Health start-period | Increase `HEALTHCHECK start-period` in Dockerfile |
