# DOCKER_STAGING_READINESS

## Base image
`python:3.12-slim-bookworm`

## FFmpeg (D4 / D5)
- `apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0`
- Version comes from the Debian bookworm indexes of the base image (reproducible for a given point release).
- Security updates: rebuild the image when the base image or security mirrors update.
- Do not pin an obsolete package solely for a fixed version string.

## User / privileges
Non-root user `shield` (uid 10001).  
Compose: `read_only: true`, `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, tmpfs for job data.

## Health check (D6)
Previous: start-period 40s.  
Hardened: **start-period 90s**, interval 30s, timeout 5s, retries 3.  
Endpoint: `GET http://127.0.0.1:8080/health`.

## Trusted proxies (D1)
Previous: `--forwarded-allow-ips *`.  
Hardened design:
- Environment variable `SHIELD_FORWARDED_ALLOW_IPS` (default empty).
- Entrypoint expands it into uvicorn `--forwarded-allow-ips`.
- Empty / unset → no trust of X-Forwarded-For (sentinel that matches no real client).
- Operator must set the real reverse-proxy address(es) only when known.
- Never use `*` in production.

## Single worker
Mandatory. Job ownership is in-memory and process-local.

## Build / run commands (target host)
```bash
cd shield-backend
cp .env.example .env
# edit SHIELD_AUTH_MODE, SHIELD_CORS_ORIGINS, SHIELD_FORWARDED_ALLOW_IPS, etc.
docker build -t ghosting-shield:local .
docker compose up
curl -s http://127.0.0.1:8080/health
```

## Status in this session
Dockerfile and entrypoint design completed; image build/run not executed here.
