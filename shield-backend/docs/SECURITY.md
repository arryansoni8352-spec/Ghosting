# Security Report (Phase 2)

## Threat model
This service accepts untrusted image uploads from the public internet (once deployed) and runs
CPU-bound ML inference on them. The main risks addressed here: malformed/oversized input,
resource exhaustion, path traversal, unauthenticated access, and leaking internal detail
through error messages.

## What is implemented

| Risk | Mitigation | Where |
|---|---|---|
| MIME-type spoofing | Format decided from file-content signature (magic bytes), never the client's `Content-Type` | `app/utils/images.py: sniff`, `open_checked` |
| Decompression bomb | Width x height checked from the file HEADER before pixel data is decoded; Pillow's own `MAX_IMAGE_PIXELS` guard also set | `images.open_checked` |
| Oversized upload (body) | ASGI middleware rejects by `Content-Length` and by running byte count, before the body is buffered in full | `app/api/middleware.py: BodyLimitMiddleware` |
| Oversized upload (stream) | Upload is read in bounded chunks with spill-to-disk for the request body | `app/utils/uploads.py: read_bounded` |
| Event-loop blocking | Processing runs in a bounded `ThreadPoolExecutor`, never on the asyncio loop; `/health` was measured to stay responsive (<1s) while a job runs | `app/core/jobs.py`, `tests/api/test_concurrency.py` |
| Unbounded concurrency | `SHIELD_MAX_CONCURRENT_JOBS` + `SHIELD_MAX_QUEUED_JOBS`; excess submissions get `503` | `JobManager.submit` |
| Runaway jobs | A watchdog thread cancels jobs exceeding `SHIELD_JOB_TIMEOUT_SECONDS`; optimisation loops poll a cooperative flag every step | `JobManager._watch`, `optimise.py` (`should_stop`) |
| Unpredictable job IDs | `secrets.token_urlsafe(32)` (43 chars, CSPRNG) | `JobManager.submit` |
| Path traversal via job id | IDs are validated against a strict regex before any filesystem path is built; non-matching IDs are rejected as 404, same as unknown IDs | `JobManager.get`, `_job_dir` |
| Arbitrary file access | Output paths are resolved and checked to be inside the job root before serving | `JobManager.output_path` |
| Stack traces / paths in responses | A catch-all exception handler returns a generic message; internal details go to the server log only; a dedicated test checks a record contains no filesystem paths | `app/main.py`, `tests/style_shield/test_engine.py::test_record_has_no_filesystem_paths` |
| Orphaned temp files | Job directories are removed on failure/cancellation/expiry; a stale-directory sweep runs at startup | `JobManager._finish`, `.purge_stale_directories` |
| Permanent storage of uploads | Input bytes are held in memory only until processing finishes, then dropped; only the output (not the original) is written to disk, and only until expiry | `Job._finish: job.input_bytes = None` |
| Unverified model weights | Checksum (SHA-256) verified before any file is used; downloads are size-capped, time-limited, and written atomically (temp file + rename) | `app/engines/style_shield/weights.py` |
| No authentication (dev default) | `SHIELD_AUTH_MODE=disabled` is the default and is logged as a warning on startup; `SHIELD_PRODUCTION_MODE=true` refuses to start unless `SHIELD_AUTH_MODE=api_key` and at least one key digest is configured | `app/main.py: _check_production` |
| Credential storage | Only SHA-256 digests of API keys are configured, never raw keys; comparison is constant-time | `app/core/security.py` |
| Abuse / flooding | Token-bucket rate limiter per client address, configurable, default 30/min | `app/core/security.py: TokenBucketLimiter` |

## What is explicitly NOT implemented (integration points only)
- **User accounts, OAuth, JWT.** The API key scheme is a shared-secret mechanism suitable for a
  trusted frontend (e.g. the GHOSTING website backend), not end users directly.
- **Multi-process / multi-host job state.** `JobManager` is in-process. A horizontally scaled
  deployment needs shared job storage (e.g. Redis, a database) and a shared rate limiter.
- **TLS.** Expected to be terminated by a reverse proxy in front of this service.
- **Virus/malware scanning of uploads.**
- **Audit logging of API key usage.**

## Tested (measured in this phase, not assumed)
- `/health` latency while a 64px balanced job (about 70s of CPU) is running: max 5-sample
  latency under 1.0s (`tests/api/test_concurrency.py::test_health_stays_responsive_during_processing`).
- A job that exceeds its configured timeout is actually stopped and marked `timed_out`
  (`test_timeout_stops_long_running_work`, waits for the real timeout).
- Weight download: correct checksum accepted and placed atomically; wrong checksum refused with
  nothing left on disk; oversized declared and actual content rejected; a stalled connection
  times out (`tests/style_shield/test_weight_download_security.py`, against a local HTTP server).
- Rate limiting and authentication enforced end-to-end against the real app
  (`tests/api/test_security.py`).
- Path-traversal-shaped job IDs (`../../etc/passwd`) return 404
  (`tests/api/test_jobs_and_options.py::test_job_id_is_unpredictable_and_unknown_id_is_404`).

## Known limitations of this phase
- No fuzzing or external penetration testing was performed.
- Only PNG, JPEG and WebP decoders (Pillow's) were exercised; other Pillow-supported formats are
  rejected by signature, but Pillow's own decoders were not independently audited here.
- The rate limiter and job manager are in-memory; a process restart loses all state (jobs and
  limiter buckets). This is acceptable for a single-instance deployment, not for a cluster.
