# STAGING_DEPLOYMENT_RUNBOOK

## Prerequisites
- Resolved model-weight licence (or keep inference disabled)
- Single backend instance (in-memory job state)
- Reverse proxy with known IP for `SHIELD_FORWARDED_ALLOW_IPS`
- Exact CORS origin for the website
- Auth mode `api_key` or carefully justified `open` behind additional controls

## Backend
1. Copy `.env.example` → `.env`; set production flags, CORS, auth digests, forwarded-allow-ips.
2. Mount verified weights (if licensed) read-only at `/app/models`.
3. `docker build -t ghosting-shield:staging . && docker compose up -d`
4. Smoke: `curl /health`, `curl /capabilities`

## Frontend
1. Build with `VITE_SHIELD_API_URL=<exact backend origin>` (or leave unset to disable).
2. Confirm CSP meta tag contains only that origin (or `'none'`).
3. Confirm consent gate appears before any upload.

## Rollback
- Revert website build to previous `dist/` without the shield URL.
- Stop the backend container; job tmpfs data is discarded on stop.

## Do not
- Push to GitHub or merge to main without explicit approval.
- Enable unlicensed weights.
- Scale to multiple workers.
