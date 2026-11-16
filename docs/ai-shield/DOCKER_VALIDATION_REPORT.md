# Docker Validation Report

**Date:** 2026-11-15  
**Docker available in sandbox:** NO — all checks are static analysis plus runtime simulation.

---

## Dockerfile review

```
FROM python:3.12-slim-bookworm         # pinned OS + Python version
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get install ffmpeg libgl1 libglib2.0-0 \  # video tools + OpenCV
 && useradd --system --uid 10001 --create-home shield
WORKDIR /app
COPY requirements*.txt ./
RUN pip install -r requirements.txt -r requirements-ml.txt -r requirements-video.txt
COPY app ./app
COPY pyproject.toml ./
RUN mkdir -p /app/models /data/jobs && chown -R shield:shield /app/models /data
USER shield                            # non-root before CMD
ENV SHIELD_JOB_DIR=/data/jobs SHIELD_DEVICE=cpu SHIELD_ALLOW_WEIGHT_DOWNLOAD=false
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if ... 200 else 1)"
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8080",
     "--workers","1","--no-access-log","--proxy-headers",
     "--forwarded-allow-ips","*"]
```

### Static checks — 13/13 PASS (see PRE_DEPLOYMENT_VERIFICATION.md §2)

### Issues and observations

| # | Observation | Severity | Recommendation |
|---|---|---|---|
| D1 | `--forwarded-allow-ips *` trusts all `X-Forwarded-For` values | Medium | Change to the proxy's specific IP or CIDR in production; `*` is acceptable only behind a trusted proxy on a private network |
| D2 | No `COPY tests/` — tests not included in image | ✓ Correct | Test code stays out of production images |
| D3 | Model weights not in image | ✓ Correct | Mounted as a read-only volume at runtime |
| D4 | `apt-get` without pinned package versions | Low | Pin `ffmpeg=<version>` for reproducible builds; unacceptable version drift between builds otherwise |
| D5 | No `--no-install-recommends` on ffmpeg apt line | Low | Add to reduce image size |
| D6 | `HEALTHCHECK start-period=40s` may be short on cold JAX init | Low | Extend to 60–90 s on the first run after weight download |

### docker-compose.yml review

Security settings verified as described in PRE_DEPLOYMENT_VERIFICATION.md §2.

Additional observation: the compose file uses `restart: unless-stopped`. Combined with in-memory job state,
a container restart loses all running jobs. Users receive 404 on their tokens after a restart. This is
documented and expected; the Privacy Policy TTL claim remains accurate because files are on tmpfs which is
also wiped on restart.

---

## Runtime simulation (no Docker)

Tested by starting the app under the same Python environment the Docker image would use, with the same
environment variables the Dockerfile sets:

| Test | Expected | Actual |
|---|---|---|
| `/health` with no key | 200 `{"status":"ok"}` | ✓ 200 |
| `POST /jobs` with no key (`auth_mode=api_key`) | 401 | ✓ 401 `auth_required` |
| `POST /jobs` with correct key (no weights) | 503 | ✓ 503 `model_unavailable` |
| `GET /capabilities` | `image.ready: false`, `model_licence_unconfirmed` | ✓ |
| `SHIELD_PRODUCTION_MODE=true` + `auth_mode=disabled` | Startup refusal | ✓ `RuntimeError` |
| `SHIELD_PRODUCTION_MODE=true` + empty API key digests | Startup refusal | ✓ `RuntimeError` |
| Security headers | `nosniff`, `no-store` | ✓ on all responses |
| CORS wildcard blocked | `ValidationError` | ✓ |

---

## Required steps before staging deployment

```bash
# On target host — exact commands
cd shield-backend

# 1. Build
docker build -t ghosting-shield:staging .

# 2. Create .env from .env.example (never commit .env)
cp .env.example .env
# Edit: SHIELD_AUTH_MODE=api_key
#       SHIELD_API_KEY_SHA256=$(printf 'YOUR-STAGING-KEY' | sha256sum | cut -d' ' -f1)
#       SHIELD_CORS_ORIGINS=https://staging.ghosting.site
#       SHIELD_PRODUCTION_MODE=true
#       SHIELD_JOB_DIR=/data/jobs

# 3. Smoke test (no weights yet — honest error expected)
docker run --rm -p 8080:8080 --env-file .env ghosting-shield:staging &
sleep 15
curl -sf http://localhost:8080/health | python3 -m json.tool
curl -sf -H "X-API-Key: YOUR-STAGING-KEY" http://localhost:8080/capabilities \
  | python3 -c "import json,sys; c=json.load(sys.stdin); print('ready:', c['image']['ready'], c['image']['readiness']['code'])"
# expect: ready: False model_licence_unconfirmed

# 4. Security scan
docker pull aquasec/trivy:latest
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image ghosting-shield:staging

# 5. Test with weights (after licence resolution)
# Mount verified weights:
docker run --rm -p 8080:8080 --env-file .env \
  -v /path/to/models:/app/models:ro \
  --tmpfs /data:size=2g,uid=10001 \
  ghosting-shield:staging
# Then: curl /capabilities → image.ready: true
# Then: pytest -m model (from host, pointing SHIELD_API_URL at the container)
```

---

## Known Docker blockers

1. **Docker binary unavailable in authoring sandbox** — build result is unknown. Must be performed on target.
2. **ffmpeg package version not pinned** — different bookworm updates may change ffmpeg behaviour. Pin before production.
3. `--forwarded-allow-ips *` — replace with proxy IP before exposing publicly.
4. `HEALTHCHECK start-period` — increase if JAX cold-start on the target host exceeds 40 s.
