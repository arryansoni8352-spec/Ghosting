# GHOSTING AI Shield — Test report

All numbers below come from commands run in the authoring sandbox (Python 3.12, FFmpeg 6.1, Node/npm, 1 vCPU, 4 GB).
Nothing was run against the real model weights (see §4).

## 1. Results

| Suite | Command | Passed | Failed | Skipped | Not run |
|---|---|---|---|---|---|
| Backend, offline | `cd shield-backend && pytest -m "not model"` | **209** | 0 | 0 | 42 deselected (`model` marker) |
| Website (Vitest) | `cd website && npx vitest run` | **130** (14 files) | 0 | 0 | — |
| Website production build | `npm run build` (tsc + vite), with and without `VITE_SHIELD_API_URL` | succeeded | — | — | — |

Backend total time ≈ 84 s; website ≈ 10 s. One third-party deprecation warning (Starlette TestClient / httpx).

### Baselines before my changes
- Website: 105 tests passed, build succeeded.
- Backend (original code): 123 offline tests passed, 39 deselected. **Caveat:** that run silently downloaded the MobileNetV1
  weights (the original default allows download on first use), meaning some "offline" tests needed the real engine.
  The weights were deleted from the sandbox afterwards and are not in the deliverable.

### What changed in the existing backend tests
- Existing API tests that exercised the real engine (job lifecycle, cancellation, timeout, concurrency, auth) needed
  weights. With downloads now off by default and no weights, they run against a **stub engine** (`stub_engine` fixture: 20 ms/step, honours cancellation) so API/job behaviour stays
  covered. The two that assert real engine output (`test_job_round_trip_real_png`, `test_real_webp_round_trip`) were
  re-marked `model` and use the real engine. Net: 123 − 2 reclassified = 121 legacy tests still passing + 88 new = 209.
- `test_plain_lossy_webp_fails_safely` now expects an immediate 422 at upload (fail-fast check) instead of a failed job.
- A `TokenClient` test wrapper injects each job's owner token automatically, as the website does.

## 2. New backend tests (88)
| File | Tests | Covers |
|---|---|---|
| `tests/video/test_probe_validation.py` | 13 | signatures; probe; WebM VP9/Opus; no audio; unsupported codec; corrupt & truncated; limits (duration, pixels, fps, frames, temp storage); rotation; VFR |
| `tests/video/test_pipeline.py` | 22 | extraction/reconstruction; audio bit-exact copy; no-audio; WebM→AAC; audio start offset; audio-before-video; rotation; VFR; scene cut & keyframes; keyframe budget; lossless exact; lossy honesty; progress monotonic; cleanup; cancellation ×4; ffmpeg timeout; failed export; missing binary; lost audio |
| `tests/video/test_temporal.py` | 11 | segment planning; scene detection; static sharing; flow vs known translation; quality-gate fallback; budget never exceeded; shared vs independent flicker (unit and end-to-end); reset cost |
| `tests/video/test_ffmpeg_safety.py` | 7 | list-only args; no shell; timeout; cancel kill; no tool output leak; env scrub; playlist inputs rejected |
| `tests/video/test_video_api.py` | 15 | full flow; ownership; real progress stages; cancel + cleanup; bad signature; corrupt; codec; oversize; duration/pixels/frames; scene budget failure; bad options; disable switch; honest 503 |
| `tests/api/test_ownership_and_policy.py` | 18 | token once; wrong/missing/foreign token (uniform 404); isolation; delete; no paths; lossless-only policy (PNG/lossless WebP ok; JPEG & lossy WebP rejected); lossy-output pre-check; dimension/size limits; honest 503 without weights; production licence block; capabilities; headers; CORS; polling not throttled; open auth mode |
| `tests/api/test_logging_privacy.py` | 2 | file names/tokens/paths absent from logs |
| `tests/video/test_video_model_integration.py` | 1 (`model`) | real-engine tiny clip — **not run** |

Image checklist from the brief: PNG ✔, lossless WebP ✔ (stub engine), invalid signature ✔ (existing), unsupported JPEG ✔,
oversized file ✔, invalid dimensions ✔, job creation/status ✔, success ✔, failure ✔ (existing), cancellation ✔ (existing),
download ✔, ownership ✔, cleanup ✔ (existing + new), existing regression tests ✔ (121 legacy).
Video checklist: with/without audio ✔, unsupported codec ✔, corrupt ✔, oversized ✔, duration ✔, resolution ✔, frame
extraction ✔, reconstruction ✔, audio preservation ✔ (decoded-audio MD5 equal), synchronisation ✔ (offset tests),
scene changes ✔, temporal consistency ✔ (measured), cancellation ✔, timeout ✔, failed export ✔, cleanup ✔.

## 3. New website tests (25)
`shieldValidation.test.ts` (8), `shieldApi.test.ts` (7), `aiShieldPage.test.tsx` (10): disabled-without-URL makes no
network calls; disclosure and consent gating; engine-unavailable message; unreachable server + retry; full image job with
server-reported progress, token header, delete; JPEG rejected before upload; server error surfaced; video limits shown;
nav entry routes; Privacy Policy section present. The 105 pre-existing website tests (including Video Studio and
navigation) still pass unmodified.

## 4. NOT executed / NOT verified
1. **All 42 `model` tests** (41 pre-existing + 1 new video one), and any real-engine image or video run. Running them
   triggers a weight download (`require_model_weights`), which was withheld because the licence is unresolved.
2. **Docker build and compose** (no Docker in the sandbox).
3. Browser end-to-end against a live backend (UI tests use mocked `fetch`); real-browser visual QA and mobile layout were
   not exercised (responsive classes only).
4. Load/DoS behaviour, multi-client contention, TLS/proxy setup.
5. Real footage (all video tests use tiny synthetic clips); H.264/VP9 variants beyond those generated by this FFmpeg build.
6. Accessibility audit with a screen reader (ARIA roles/labels were added; not tested with AT).
7. `pip-audit` / `npm audit`.

## 5. Reproduce
```bash
cd shield-backend && pip install -r requirements.txt -r requirements-ml.txt -r requirements-video.txt -r requirements-dev.txt
pytest -m "not model" -p no:cacheprovider
python -m scripts.evaluate_video_temporal
cd ../website && npm ci && npx vitest run && npm run build
```
