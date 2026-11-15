# GHOSTING Integration Guide

This describes how the GHOSTING website WOULD connect to this standalone service. **Nothing in
this document has been acted on**: the website and its repository have not been touched, and
nothing has been deployed. This is guidance for whenever that integration is actually built.

## Principles (unchanged from Phase 1)
1. **Separate deployment.** Shield runs as its own process with its own dependencies and
   hardware. The website never imports Shield code directly.
2. **Website changes are out of scope for this project** and happen in the website's own
   repository, only after the owner decides to proceed.
3. **Explicit contract.** The website talks to Shield only through its HTTP API
   (`app/schemas/`, OpenAPI at `/docs`).
4. **No silent protection.** The website must show users what was attempted, what it does and
   does not demonstrate (see the status summary in `README.md`), and must never discard the
   user's original file.
5. **Honesty about effectiveness.** As of this phase, Style Shield's protective effect has not
   been demonstrated (`docs/STYLE_SHIELD_TECHNICAL_REPORT.md`). Any UI copy must say so — not
   "protects your art" but "experimental, unproven perturbation; see the report for details."

## The real API surface (Phase 2)

Processing is asynchronous: the website submits a job, then polls or waits briefly.

| Step | Endpoint | Notes |
|---|---|---|
| Check the service is up | `GET /health` | Also reports the real JAX/GPU backend and model verification status |
| Show available engines | `GET /models` | Style Shield `implemented: true`; Face Shield `implemented: false` |
| Submit an image | `POST /engines/style_shield/jobs` | Multipart; returns `202` with a `job_id` immediately |
| Poll status | `GET /jobs/{job_id}` | `queued → running → succeeded / failed / cancelled / timed_out` |
| Get the result | `GET /jobs/{job_id}/output` | Only after `succeeded`; binary image, correct `Content-Type` |
| Get the full record | `GET /jobs/{job_id}/record` | Parameters, target style, timings, quality metrics, model checksum |
| Cancel | `POST /jobs/{job_id}/cancel` | Stops a running job at its next optimisation step |
| Delete | `DELETE /jobs/{job_id}` | Removes the output immediately, instead of waiting for TTL expiry |

A synchronous convenience endpoint (`POST /engines/style_shield/protect`) exists for quick
testing; it waits up to `SHIELD_SYNC_WAIT_SECONDS` and falls back to returning a job id if
processing is still running. **The website integration should use the job-based flow above**,
since processing can take from under a minute to several minutes depending on image size.

### Example: submit and poll

```
POST /engines/style_shield/jobs
  file=<upload>, strength=balanced, output_format=png
  -> 202 {"job_id": "...", "state": "queued", "status_url": "/jobs/...", ...}

GET /jobs/{job_id}        (poll every 1-2s)
  -> {"state": "running", "stage": "cloaking", "progress": 0.42, ...}
  -> {"state": "succeeded", "output_available": true, ...}

GET /jobs/{job_id}/output -> binary image
GET /jobs/{job_id}/record -> full JSON record
```

### Output format guidance for the website
**Use `output_format=png`, or `output_format=webp` with `webp_lossless=true`.** JPEG and plain
(lossy) WebP output currently always fail with `422 budget_unsatisfiable` — their own
compression exceeds every preset's perturbation budget, independent of the protection itself.
See `README.md`'s format table before building any format picker in the UI.

## Data flow (target design, updated)
1. User uploads an image to the website.
2. Website submits a job to Shield over HTTPS (`strength`, `output_format=png` or
   `webp`+`webp_lossless`).
3. Website polls `/jobs/{id}` and shows progress (`stage`, `progress`) to the user.
4. On success, website fetches `/jobs/{id}/output` and `/jobs/{id}/record`, shows a before/after
   comparison and the quality metrics, and offers the protected file for download.
5. Website calls `DELETE /jobs/{id}` once the user has downloaded the result, so Shield does not
   need to wait for TTL expiry to free the temporary file.
6. Website stores nothing of the original beyond what it already stores for uploads elsewhere;
   Shield itself never persists the original past job completion.

## Authentication and rate limiting (Phase 2: implemented as integration points)
- Set `SHIELD_AUTH_MODE=api_key` and `SHIELD_API_KEY_SHA256=<sha256-of-the-website's-shared-key>`
  on the Shield deployment. The website sends `X-API-Key: <raw key>` on every request.
- Set `SHIELD_PRODUCTION_MODE=true` so the service refuses to start without authentication
  configured — this is a deliberate safety check, not optional hardening.
- `SHIELD_RATE_LIMIT_PER_MINUTE` protects Shield itself from being overwhelmed; the website
  should still apply its own per-user limits upstream, since Shield's limiter is per-IP and
  in-process (not shared across instances).
- This is a **shared-secret scheme between the website's backend and Shield**, not a substitute
  for the website's own end-user authentication. See `docs/SECURITY.md`.

## Hosting
- CPU hosting works but is slow (tens of seconds to minutes per image; see
  `docs/STYLE_SHIELD_TECHNICAL_REPORT.md` for measured timings). A GPU host would help but has
  not been tested in this project.
- `SHIELD_MAX_CONCURRENT_JOBS` / `SHIELD_MAX_QUEUED_JOBS` should be sized to the host's CPU
  count; excess submissions return `503 server_busy`, which the website should surface as
  "try again shortly", not as an error.
- The website calls Shield's URL from a configuration variable, never a hard-coded address.
- `JobManager` state (jobs, rate-limit buckets) is in-process only. A multi-instance Shield
  deployment needs a shared queue/store; this has not been built.

## Readiness checklist (updated)
- [x] Phase 2 evaluation harness reports measured quality numbers
- [ ] An engine has passed an independent (non-white-box) effectiveness test — not yet; the one
      controlled experiment performed used the same model for optimisation and evaluation, and
      showed a null result (see the technical report)
- [x] Authentication implemented (shared API key; not a full identity system)
- [x] Rate limiting implemented (per-process token bucket)
- [ ] Owner reviews the user-facing claims text
- [ ] Owner decides the storage and retention policy beyond Shield's own job TTL
- [ ] Model checkpoint licence resolved for production use (`docs/MODEL_LICENSING_REPORT.md`)
- [ ] Multi-instance job storage, if the website expects to run more than one Shield instance

## What will NOT be done
- Modifying the GHOSTING website code or repository as part of this project.
- Claiming universal, guaranteed, or verified protection against facial recognition or AI style
  mimicry, now or after integration.
- Deploying this service anywhere.
