# GHOSTING AI Shield — Research limitations

**Experimental — protection effectiveness has not yet been independently validated.**
This document separates *engineering facts* (tested) from *scientific claims* (none are made).

## 1. What the evidence says about the Image Shield engine
- The supplied project's first controlled experiment is a **null result**: victim-style recognition stayed at 1.0 for
  clean images, magnitude-matched random noise, and Style Shield images (`shield-backend/docs/experiments/style_shield_results.json`,
  `docs/STYLE_SHIELD_TECHNICAL_REPORT.md`). No protection effect was demonstrated.
- A second, independent cross-model/robustness evaluation was started and **never completed**.
- The generation model (MobileNetV1 checkpoint) has an **unresolved licence**; the independent evaluator checkpoint
  (SqueezeNet) is BSD-2-Clause.
- The engine is **not** VeilGuard's PyTorch engine and the two are not interchangeable.
- Face Shield is not implemented.

What *is* engineering-verified: the pixel-change budget is enforced exactly and re-checked on the encoded output;
dimensions are preserved; lossy outputs that cannot meet the budget are refused.

## 2. Video Shield: what was built and measured (synthetic data only)
Reproduce: `python -m scripts.evaluate_video_temporal` (96×64 synthetic clips, a **stand-in** ±4 noise perturbation
instead of the AI engine, so these numbers describe pipeline behaviour, not protection).

| Measurement | Result | Reading |
|---|---|---|
| Flicker excess, independent per-frame perturbation (baseline) | 2.26 – 2.40 levels | per-frame perturbations flicker |
| Flicker excess, shared perturbation (`static`), static camera | 0.00 | sharing removes flicker |
| Same, content moving inside a static frame | 0.057 | small |
| Same, global pan | 0.112 | small |
| Flicker excess across a **segment reset** | 2.26 | **a reset is as visible as independent noise at that frame**; scene cuts hide it, mid-scene resets do not |
| `flow` mode, global pan | 0.355 (worse than static 0.112); engaged on only 2 of 34 frames, rest fell back | **flow mode not shown to help end-to-end**; default is `static` |
| `flow` on a known 3 px translation (unit test) | error ≤ 25 % of the static error | the warp itself works when the quality gate trusts it |
| H.264 CRF 16 round-trip, budget 4 levels | max change 22; budget **not** satisfied; perturbation correlation 0.24 | lossy encoding largely removes and distorts the perturbation |
| FFV1 lossless round-trip | max change 4; budget satisfied; correlation 1.0 | exact |

Flicker excess is `mean |(P_t − P_{t−1}) − (O_t − O_{t−1})|` in 8-bit levels (P = protected, O = original). It is a
screen-space measure, so it penalises a perturbation that deliberately moves with content; that is why `flow` scores
worse on a pan. A motion-compensated metric was not implemented.

## 3. What is NOT known
1. Whether a perturbation optimised on one keyframe protects the other frames of its segment against **any** model.
   This transfer is untested and is the central open question of the design.
2. Whether any of this affects any video-generation, recognition or training pipeline.
3. Scene-cut thresholds (`scenes.py`) were tuned on synthetic clips only.
4. Behaviour on real footage: motion blur, fades, dissolves, handheld motion, noise, HDR, interlacing, 10-bit,
   non-709/601 colour spaces. Colour handling is pinned to BT.601/709 only.
5. Real-engine CPU time and memory per keyframe (weights unavailable here). Limits are conservative guesses.
6. Social-platform re-encoding: any platform that re-compresses (almost all do) will behave like the H.264 row above.

## 4. Claims AI Shield must not make (enforced in the UI copy)
Guaranteed protection · prevention of AI training · prevention of style imitation · resistance to all/any specific
model · Glaze or Nightshade equivalence · validated video protection. The interface shows the experimental notice on
every AI Shield screen and every result card states "Protection effectiveness: Not measured"; every record has
`effectiveness: null`.

## 5. Path to a real claim
(a) Resolve the checkpoint licence or replace the backbone; (b) finish the cross-model evaluation with real art
datasets and pre-registered success criteria; (c) for video, run the same recognition/imitation tests on shared-vs-
per-keyframe-vs-no perturbation, after H.264 and after platform re-encoding; (d) only then change any wording.
