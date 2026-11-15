# GHOSTING AI Shield — API

Base URL: configured by the website via `VITE_SHIELD_API_URL`. All responses carry `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`. Errors are JSON: `{"error": "<code>", "message": "<client-safe text>"}`.
OpenAPI is served at `/docs` and `/openapi.json` (disable at the proxy in production if you prefer).

## Headers
| Header | When | Meaning |
|---|---|---|
| `X-Job-Token` | every `/jobs/{id}…` call | owner token returned **once** at job creation |
| `X-API-Key` | only if `auth_mode=api_key` | access key entered by the user (server stores SHA-256 digests) |

A wrong/missing token, a foreign job and an unknown id all return the **same 404** (`job_not_found`).

## Endpoints

### `GET /health` — liveness
`200`, reports status plus JAX/device information. No filesystem paths, no secrets.

### `GET /capabilities` — what this server can do now
Returns: `experimental_notice`, `access`, `image{ready, readiness{code,message}, presets[], input_formats[],
output_formats[], limits}`, `video{enabled, ready, ffmpeg_available, optical_flow_available, containers, video_codecs,
audio_codecs, output_profiles[], temporal_modes[], limits}`, `retention{job_ttl_seconds,…}`, `logging`,
`third_party_services`. Readiness codes: `ready`, `will_download`, `model_not_installed`, `model_checksum_failed`,
`model_licence_unconfirmed`.

### `GET /models` — engine descriptions (existing)

### `POST /engines/style_shield/jobs` — create an image job → `202`
multipart: `file` (PNG or lossless WebP), `strength` (`low|balanced|high`, default balanced), `output_format`
(`png|webp|jpeg`, web UI offers only png/webp), `webp_lossless` (bool), `quality`, `seed`, `max_steps`.
Response: `{"job_id","owner_token","state","status_url","record_url","output_url"}`.
Errors: `400 corrupt_image | unsupported_image` (JPEG, lossy WebP, unrecognised signature), `401 auth_required` (api_key mode), `413 upload_too_large | image_too_large`,
`422 budget_unsatisfiable | invalid_option`, `429 rate_limited`, `503 model_unavailable | server_busy`.

### `POST /engines/style_shield/protect` — synchronous variant (existing; returns base64, ≤ `sync_wait`)

### `POST /video/jobs` — create a video job → `202` *(experimental)*
multipart: `file` (MP4/MOV H.264, or WebM VP8/VP9), `strength` (default balanced), `output_profile`
(`compatible` MP4/H.264 | `lossless` MKV/FFV1; default compatible), `temporal_mode` (`static` default | `flow`),
`seed`, `max_steps` (per keyframe).
Validated **before queueing** from the bytes (signature, ffprobe, limits). Response includes `owner_token` and
`input{container, video_codec, width, height, rotation_applied, frame_rate, variable_frame_rate, duration_seconds,
estimated_frames, audio, notes[]}`.
Errors: `415 unsupported_video` (signature/codec), `400 video_corrupt`, `413 upload_too_large | video_limit_exceeded`
(duration, pixels, fps, frames, temp storage), `422 invalid_option`, `404 engine_not_found` (video disabled),
`503 model_unavailable`.

### `GET /jobs/{id}` — status
`{job_id, engine, kind: image|video, state: queued|running|succeeded|failed|cancelled|timed_out, stage, progress 0..1,
created_at, started_at, finished_at, expires_at, error{code,message}|null, output_available}`.
`progress` and `stage` are what the worker actually reported (video stages: probing, extracting_frames,
detecting_scenes, protecting_keyframe_N_of_M, propagating, encoding, validating).

### `GET /jobs/{id}/output` — result file
Image: png/webp. Video: `video/mp4` (supports Range) or `video/x-matroska`. `409 job_not_ready` until succeeded.

### `GET /jobs/{id}/record` — protection record
Image record: unchanged engine record (`budget_integer_levels`, `max_change_after_encoding`, …).
Video record: `options`, `input`, `frames{count, frame_rate, scene_count, scene_starts, keyframes, keyframe_interval_relaxed}`,
`audio{present, handling}`, `temporal_consistency{flicker_excess_within_segment, flicker_excess_across_reset,
propagation_modes, mean/max_abs_perturbation}`, `keyframe_results[]`, `output{lossless, bytes,
max_change_vs_original_after_encoding, budget_satisfied_after_encoding, budget_note, perturbation_correlation_after_encoding,
psnr_encoded_vs_protected_frames_db}`, `validation{…checks}`, and `effectiveness: null` (always — never measured).

### `POST /jobs/{id}/cancel` → `202`
Queued: removed. Running: cancel flag is honoured between frames and kills ffmpeg children. Result state `cancelled`;
all files removed.

### `DELETE /jobs/{id}` → `204`
Cancels if running, removes input, frames, output and record immediately.

## Limits (defaults; see `/capabilities` for the live values)
Image: 15 MB, 262 144 px, ≥ 32 px per side. Video: 50 MB, 10 s, 262 144 px/frame, 30 fps, 300 frames, 4 protected
keyframes, 1 GiB estimated raw frame storage.

## Rate limiting
Token bucket per client address: uploads `SHIELD_RATE_LIMIT_PER_MINUTE` (30), status/download
`SHIELD_READ_RATE_LIMIT_PER_MINUTE` (600). `429` includes `Retry-After`. Behind a proxy, run uvicorn with
`--proxy-headers` and make sure only your proxy can set `X-Forwarded-For`.
