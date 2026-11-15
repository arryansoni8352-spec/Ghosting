# AI Shield — Known Limitations

## Hard blockers (cannot launch without resolving)

### L1 — MobileNetV1 checkpoint licence unresolved
No explicit licence for the trained weight values was located at the packaging repo (fchollet/deep-learning-models,
MIT) or the original TensorFlow-Slim model zoo. Commercial use and redistribution status are **not established**.
The code enforces this: `licence_confirmed = False`; production mode refuses to load the engine.
**Fix:** Contact the TensorFlow team for an explicit licence statement, or replace the backbone with one that
carries a confirmed permissive licence (e.g. MobileNetV3 via torchvision under BSD-3-Clause).

### L2 — Real-engine never executed against this codebase
42 model tests exist and have never been run. The pipeline, API, and temporal logic are tested with a
deterministic stub. All real-inference behaviour is unverified.

### L3 — Docker image never built
Dockerfile is syntactically valid. No build has been executed. Environment issues (library conflicts, OS
dependencies) may only appear on the target host.

## Operational limitations (known, documented)

### L4 — Single-process, in-memory job state
Running `--workers 2` or autoscaling above 1 instance breaks job ownership and progress tracking. `--workers 1`
is pinned in the Dockerfile. Restart loses all in-flight jobs (users see a 404 on their token).

### L5 — CPU time and memory per job are unmeasured
Limits (10 s video, 4 keyframes, 15 MB image) are conservative guesses based on the supplier's README (~70 s
per 128 px image at balanced preset on CPU). Real jobs may be slower or faster. Tune only after measuring.

### L6 — H.264 output breaks the pixel-budget
The `compatible` MP4 profile reports `budget_satisfied_after_encoding: false` for typical content (H.264 CRF 16
changes pixels by ~22 of 255 against a 4-level budget). This is correct and honest, but may confuse users.
The lossless FFV1 profile is exact. Consider adding a tooltip.

## Scientific limitations (by design — these are research limitations, not bugs)

### L7 — Protection effectiveness unproven
The earlier controlled experiment produced a null result (no demonstrated protection). A second evaluation was
started but never completed. No effectiveness claim is made in the UI or the record (`effectiveness: null` always).

### L8 — Keyframe-to-segment perturbation transfer untested
Video Shield shares one keyframe's perturbation across a segment (up to 24 frames by default). Whether this
provides any protection to the non-keyframes against any model has no data.

### L9 — H.264 and platform re-encoding largely removes the perturbation
Most social platforms re-encode uploads. The lossless FFV1 output preserves the budget exactly, but is not
playable in browsers and would also be re-encoded by any platform.

### L10 — Optical-flow mode not shown to help end-to-end
`flow` mode did not outperform `static` on any tested synthetic clip (flicker 0.355 vs 0.112 on a global pan).
Default is `static`. `flow` remains available but is marked experimental in the UI.

### L11 — Synthetic-clip-only temporal measurements
All temporal-consistency measurements (`scripts/evaluate_video_temporal.py`) used 96×64 synthetic clips with a
stand-in noise perturbation. Results on real footage are unknown.

## Minor / deferred

### L12 — Home page "Zero Network Calls" copy
Reads site-wide. Now inaccurate if AI Shield is live. Owner decision required; `HomePage.tsx` deliberately not edited.

### L13 — `deploy-pages.yml` not updated
AI Shield is invisible on the live site until the workflow is updated to pass `VITE_SHIELD_API_URL`. Intentional.

### L14 — No `pip-audit` / `npm audit` run
Dependency vulnerability scan not performed.

### L15 — No screen-reader / accessibility testing
ARIA roles and labels added; not verified with assistive technology.
