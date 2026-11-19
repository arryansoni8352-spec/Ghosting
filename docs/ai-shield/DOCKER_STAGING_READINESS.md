# Docker Staging Readiness

**Docker build status:** NOT EXECUTED — Docker unavailable in authoring sandbox.  
All validation is static analysis + entrypoint script tests + FastAPI TestClient runtime simulation.

---

## Base image
`python:3.12-slim-bookworm` — pinned to Debian Bookworm. Receives security patches via
Debian stable-updates. Not pinned to a digest (image digest changes with security updates,
which is desirable behaviour here — rebuild to pick up OS patches).

## FFmpeg version
Installed via `apt-get install ffmpeg` from Debian Bookworm repositories.
Bookworm ships `ffmpeg 5.1.6-0+deb12u1`. This is the **maintained** distribution version
with backported security patches. It is not version-pinned in the Dockerfile by explicit
package version (`ffmpeg=5.1.6*`) but the base image is pinned to `bookworm-slim` which
fixes the repository.

**D4 partial resolution:** A full digest-pinned reproducible build would require
`apt-get install ffmpeg=5.1.6*`, which risks `no such package` on a fresh bookworm image
if Debian updates the patch version. Current approach (image layer caching + explicit
rebuild for security updates) is the standard Debian container practice. Document: **rebuild
the image when Debian publishes a new `ffmpeg` security update for bookworm.** Use
`apt-get install -y --no-install-recommends ffmpeg` (D5 fix already applied) to minimise
footprint.

## Container user
`shield` — UID 10001, non-root, system account. `chown -R shield:shield /app/models /data`.
Container runs as `USER shield` before the entrypoint.

## Ports
`127.0.0.1:8080:8080` — bound to loopback only in `docker-compose.yml`. Not reachable from
the public internet without a reverse proxy. The reverse proxy terminates TLS and forwards to
`127.0.0.1:8080`.

## Health check
```
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=4).status == 200 else 1)"
```
`start-period=90s` — conservative for JAX cold-start. If the host is fast and weights
are pre-loaded, reduce to 60s. If cold-start consistently exceeds 90s, increase to 120s and
investigate whether model loading should be lazy.

## Resource limits
`mem_limit: 4g`, `cpus: 2` in `docker-compose.yml`. Adjust based on measured real-engine
job resource usage (not yet measured — model licence unresolved).

## Trusted proxy (D1)
`SHIELD_FORWARDED_ALLOW_IPS` env var, consumed by `docker-entrypoint.sh`.
- Unset (default): `--forwarded-allow-ips` is NOT passed; uvicorn ignores `X-Forwarded-For`.
- Set to proxy IP/CIDR: passed through. `*` causes immediate startup failure (non-zero exit).
- For the actual hosting provider: set this to the internal IP of the load balancer/proxy.
  Consult provider docs (Fly.io: `fdaa::/16`; Render: `10.0.0.0/8` typical; Railway: varies).

## Environment variables (required for staging)
```bash
SHIELD_PRODUCTION_MODE=true
SHIELD_AUTH_MODE=api_key
SHIELD_API_KEY_SHA256=<sha256 of your staging key>
SHIELD_CORS_ORIGINS=https://staging.ghosting.site
SHIELD_JOB_DIR=/data/jobs              # backed by tmpfs in compose
SHIELD_LOG_LEVEL=INFO
SHIELD_ALLOW_WEIGHT_DOWNLOAD=false
SHIELD_FORWARDED_ALLOW_IPS=            # set to proxy IP; leave empty for direct
```

## Build command
```bash
cd shield-backend
docker build -t ghosting-shield:staging .
```

## Run command (staging, no weights)
```bash
docker run --rm \
  -p 127.0.0.1:8080:8080 \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /data:size=2g,uid=10001 \
  --tmpfs /tmp:size=256m \
  -v /path/to/models:/app/models:ro \
  --env-file .env \
  ghosting-shield:staging
```

## Health verification
```bash
curl -sf http://127.0.0.1:8080/health | python3 -m json.tool
# expect: {"status": "ok", ...}
curl -sf -H "X-API-Key: YOUR-KEY" http://127.0.0.1:8080/capabilities \
  | python3 -c "import json,sys; c=json.load(sys.stdin); print('image ready:', c['image']['ready'])"
# expect: image ready: False (no weights yet)
```

## Common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Container exits immediately | `SHIELD_FORWARDED_ALLOW_IPS=*` | Set to proxy IP or unset |
| Exits with "Refusing to start" | `auth_mode=disabled` + `production_mode=true` | Set `SHIELD_AUTH_MODE=api_key` |
| Exits with "no API key digests" | `SHIELD_API_KEY_SHA256` empty | Set to sha256 of your key |
| Health check fails for 90s then marks unhealthy | JAX cold-start > 90s | Increase `start-period` |
| `/capabilities` returns `model_licence_unconfirmed` | Expected — licence gate | Normal until licence resolved |
| 401 on all requests | Auth enabled, no key | Send `X-API-Key: <your-key>` header |
| 429 on uploads | Rate limit hit | Default: 30/min per IP; adjust `SHIELD_RATE_LIMIT_PER_MINUTE` |
