# GHOSTING AI Shield — Security

## Threat model (what was designed for)
Anonymous internet users upload untrusted files to a compute-heavy service; other users must not access each
other's jobs; media parsers (ffmpeg) are a large attack surface; the service must not be a free compute or storage
sink.

## Controls and where they are tested
| Control | Implementation | Test |
|---|---|---|
| File-signature validation (client type/name ignored) | `utils/images.py`, `video/signature.py` | `test_input_validation`, `test_video_api::test_unsupported_signature_rejected` |
| Size, dimension, duration, resolution, fps, frame, temp-storage limits | `read_bounded`, `video/probe.validate`, body-size middleware | `test_probe_validation::test_limits_enforced`, `test_video_api` limits |
| Lossless-only image input | `routes_engines._prepare` | `test_ownership_and_policy` (JPEG, lossy WebP rejected) |
| Job ownership (256-bit token, digest stored, constant-time compare, uniform 404) | `core/jobs.py`, `core/security.job_token` | `test_ownership_and_policy` (5 tests), `test_video_job_is_owned` |
| Optional access key (user-typed; digests server-side) | `core/security.require_auth` | `test_security` |
| Rate limiting, separate upload / polling buckets | `core/security` | `test_security`, `test_status_polling_is_not_throttled…` |
| No shell, list-only args, per-call timeout, kill on cancel, scrubbed env | `video/ffmpeg.py` | `test_ffmpeg_safety` (7) |
| Forced demuxer + `-protocol_whitelist file` (no playlists/concat/network reads) | `video/probe.py`, `pipeline.py` | `test_playlist_style_inputs_are_rejected_by_signature` |
| Tool output never reaches clients | `VideoProcessingError` messages are fixed strings | `test_failed_export…`, `test_failure_message_does_not_leak…` |
| No filesystem paths in responses | status/record/capabilities | `test_status_exposes_no_paths_or_input` |
| Private job dirs, output only via token-checked route | `core/jobs.py` (path containment check) | `test_jobs_and_options`, cleanup tests |
| Automatic cleanup (TTL sweep, failure, cancel, delete, restart purge, frames in `finally`) | `core/jobs.py`, `pipeline.py` | `test_temporary_files_removed_after_success`, cancellation tests, `test_concurrency` |
| CORS allow-list; no cookies | `main.py` (`SHIELD_CORS_ORIGINS`) | `test_cors_allows_only_configured_origin` |
| Security headers on every response | `SecurityHeadersMiddleware` | `test_security_headers_on_every_response` |
| Log hygiene | logging config + tests | `test_logging_privacy` |

**CSRF:** the API uses no cookies or ambient credentials; every state-changing call needs a header
(`X-Job-Token` / `X-API-Key`) that a cross-site form cannot set, and CORS is allow-listed. CSRF tokens are therefore
not applicable. If you ever add cookie auth, this must be revisited.

**Website:** the CSP stays `default-src 'self'`; `connect-src` allows only the configured backend origin. No secrets
in the bundle. The access key lives in `sessionStorage`; the job token only in memory.

## Residual risks (not solved — decide before public launch)
1. **Anonymous compute abuse.** `open` mode relies on per-IP rate limits and a one-job-at-a-time queue; a
   distributed attacker can fill the queue (`server_busy`). Mitigate with `api_key` mode, a CAPTCHA/WAF in front, or
   an invite code. No CAPTCHA is included.
2. **Client address behind proxies.** Rate limiting keys on the connection address; behind a proxy you must run with
   proxy headers and block spoofed `X-Forwarded-For` at the edge, otherwise limits are bypassable or shared.
3. **ffmpeg/ffprobe CVEs.** Media parsers are risky. Keep the image updated, run the container read-only as non-root
   (compose does), and consider a seccomp/gVisor sandbox. Inputs are restricted to MP4/MOV/WebM, which reduces but
   does not remove exposure.
4. **Single process, in-memory state.** Jobs vanish on restart; more than one worker would give inconsistent state and
   broken ownership checks. The Dockerfile pins `--workers 1`.
5. **Token loss / XSS.** The job token sits in page memory; an XSS in the site would expose it. The strict CSP is the
   mitigation.
6. **Weights and licence.** MobileNetV1 checkpoint licence is unresolved; production mode refuses the engine until
   `licence_confirmed` is changed deliberately in code.
7. **Untested here:** Docker build, real-engine runs, load/DoS behaviour, TLS/proxy configuration.
8. **Dependency audit** (`pip-audit`, `npm audit`) was not run.
