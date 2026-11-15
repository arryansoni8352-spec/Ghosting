# GHOSTING AI Shield — Implementation

Status: **implemented, experimental, not deployed.** Nothing here has been pushed, released or deployed.
Protection effectiveness has **not** been independently validated (see `GHOSTING_AI_SHIELD_RESEARCH_LIMITATIONS.md`).

## 1. Architecture

```
 GitHub Pages (static)                      Container host (you choose)
┌───────────────────────────┐   HTTPS     ┌─────────────────────────────────────────────┐
│ website/  React 19 + Vite │ ──────────► │ shield-backend/  FastAPI, ONE worker        │
│  #/ai-shield page         │  X-Job-Token│  routes_engines  (image jobs)               │
│  VITE_SHIELD_API_URL      │  X-API-Key  │  routes_video    (video jobs)               │
│  CSP connect-src = that   │  (optional) │  routes_jobs     (status/output/cancel/del) │
│  one origin only          │             │  routes_capabilities (/capabilities)        │
└───────────────────────────┘             │  core/jobs.py    in-memory queue + TTL      │
                                          │  engines/style_shield  JAX engine (zip)     │
                                          │  video/          ffmpeg pipeline            │
                                          └─────────────────────────────────────────────┘
 VeilGuard desktop app + engine/ (PyTorch): untouched. Video Studio (browser metadata tool): untouched.
```

The two protection engines stay separate: VeilGuard's PyTorch engine is not used or modified; AI Shield uses
only the supplied JAX/FastAPI project.

## 2. Image Shield

The supplied engine (`app/engines/style_shield/`) is used unchanged except for two safety edits:
- weights are downloaded only if `SHIELD_ALLOW_WEIGHT_DOWNLOAD=true` (default **false**), and a missing/invalid
  checkpoint becomes a clean `model_unavailable` error instead of an internal error;
- `StyleShieldEngine.readiness()` reports, without loading anything, whether the engine can run.

The strict perturbation budget (integer levels per preset: low 4, balanced 8, high 16 of 255), PNG and lossless
WebP output, lossy-output verification and the optimiser are untouched. Added at the API layer:
- **input policy** (`SHIELD_IMAGE_INPUT_POLICY=lossless_only`, default): PNG and lossless WebP uploads only;
  JPEG and lossy WebP are rejected (lossless WebP is detected by walking RIFF chunks for `VP8L`);
- **fail-fast lossy output check**: a lossy output format whose own codec distortion already exceeds the preset
  budget is refused with 422 *before* queueing;
- **readiness gate**: if the engine cannot run (no weights, licence unconfirmed in production), creation returns
  503 `model_unavailable` and no job is created.

## 3. Video Shield (new)

Pipeline (`app/video/pipeline.py`), each stage reports real progress and checks cancellation:

| Stage | What happens |
|---|---|
| probe | ffprobe with forced demuxer; codec/duration/size/fps/frames/temp-storage limits; rotation and VFR detected |
| extract | ffmpeg → PNG frames, constant frame rate, rotation applied, colour matrix pinned |
| scenes | histogram + mean-abs-diff cut detection (`scenes.py`) |
| keyframes | one frame per segment (segment = scene chunk ≤ interval) goes through the image engine |
| propagate | the keyframe's exact integer perturbation `delta` is applied to the rest of the segment (`temporal.py`) |
| encode | `compatible` (H.264 MP4) or `lossless` (FFV1 MKV); first audio stream copied or AAC-encoded; start offset preserved |
| validate | output re-probed and decoded; frame count, size, fps, duration, audio presence, A/V sync checked; budget measured |

**Temporal consistency (implemented, measured).** Independent per-frame perturbations flicker. Instead each
segment shares one perturbation (budget-bounded by construction: `clip(frame + delta)`), scene changes force a
reset, and segment length is capped. Optional `flow` mode resamples `delta` along Farneback optical flow with a
quality gate. Measured results and their limits are in the research-limitations document; in short, sharing removes
flicker on synthetic clips, **resets themselves are visible**, and `flow` mode did not help end to end, so the
default is `static`.

**Budget honesty.** `lossless` output verifies the integer budget exactly on decoded frames. `compatible` (H.264) does
not preserve it; the record states `budget_satisfied_after_encoding: false` plus a plain-language note whenever that
is the case.

**Fixed behaviours:** only the first audio stream is kept; container metadata is not copied; VFR input is converted
to constant frame rate (noted in the record); audio that begins before the first frame is trimmed (reported).

## 4. Ownership, auth, limits
Every job gets a 256-bit random owner token returned once; only its SHA-256 is stored. All job operations require
`X-Job-Token`; wrong/missing token = the same 404 as an unknown job. Optional access key (`SHIELD_AUTH_MODE=api_key`)
is typed by the user and never embedded in JS. Separate rate limits for uploads and for polling. See
`GHOSTING_AI_SHIELD_SECURITY.md`.

## 5. Files created / modified
See `GHOSTING_AI_SHIELD_ANTIGRAVITY_HANDOFF.md` §1 for the exact list.

## 6. Known gaps
- Real-engine behaviour (image or video) is **untested here**: weights were unavailable by design. 42 model tests exist and were not run.
- CPU time per keyframe, memory and throughput are **unmeasured**. Limits are conservative guesses, not benchmarks.
- Docker image written but **not built** (no Docker in the authoring sandbox).
- Single worker only; state is lost on restart (by design, documented).
