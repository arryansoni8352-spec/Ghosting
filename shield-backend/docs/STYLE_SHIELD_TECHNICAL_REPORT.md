# Style Shield: Technical Report

**Status: implemented, Glaze-inspired, NOT an exact reproduction of Glaze.**
**Result: the controlled proxy experiment shows no measurable effect on the probe.** No protection
claim is made. See §6.

---

## 1. Summary
Style Shield computes a bounded, gradient-based perturbation for an artwork. The perturbation
moves the artwork's MobileNetV1 features toward those of a style-transferred version of itself,
which uses a randomly chosen target style. It is constrained by an L∞ budget and an SSIM-based
penalty. Visual similarity and adversarial effectiveness are measured separately.

Components, each a substitution from Glaze (full rationale in `STYLE_SHIELD_DESIGN.md` §4):

| Component | This implementation | Glaze |
|---|---|---|
| Feature extractor Φ | MobileNetV1, ImageNet (Keras weights, ported to JAX) | Stable Diffusion autoencoder-KL |
| Style transfer Ω | Gatys-style Gram-matrix transfer on Φ | Diffusion-based image-to-image |
| Perceptual constraint | L∞ budget ε + SSIM distance penalty | LPIPS, budget p |
| Target selection | Centroid-distance 50th–75th percentile band, random pick | Same rule, 1119 WikiArt styles |

## 2. Algorithm (as implemented)

Given artwork x (values in [0,1]), target style T, budget ε, steps S, learning rate η:

1. **Target selection.** Compute the victim's centroid in pooled `conv_pw_7_relu` features from
   its own artwork. Compute each candidate's centroid from four images. Keep candidates whose
   centroid distance lies in the [p50, p75] band of all candidate distances. Pick one uniformly at
   random with a recorded seed.
2. **Target image.** Ω(x, T) is produced by Gatys transfer: 200 Adam steps, learning rate 0.02,
   content layer `conv_pw_5_relu`, style layers `conv_pw_2/4/6_relu`, style weight 1e4.
3. **Cloak.** Parameter w starts at zero. δ = ε·tanh(w), x' = clip(x + δ, 0, 1).
   Loss L(w) = mean over `conv_pw_3/5/7_relu` of MSE(Φ(x'), Φ(Ω)) + α·max(D_s(x,x') − p_s, 0),
   where D_s = (1 − SSIM)/2. Adam, S steps.
4. **Output.** Quantise to 8 bits and check |out − x| ≤ ε + 1/255 everywhere.

Presets (our values, not tuned):

| Preset | ε | Steps | η | α | p_s |
|---|---|---|---|---|---|
| low | 4/255 | 200 | 0.01 | 10 | 0.02 |
| balanced | 8/255 | 500 | 0.01 | 2 | 0.05 |
| high | 16/255 | 500 | 0.02 | 0.5 | 0.10 |

## 3. Implementation verification
- MobileNetV1 port: max absolute error 3.3e-5 against the original Keras model at five depths
  (reference stored in `tests/fixtures/mobilenet_reference.npz`).
- JAX SSIM: agreement with the Phase 2 NumPy SSIM within 1e-7.
- Budget: enforced by construction and checked after quantisation.
- Optimiser behaviour: loss falls; cloaks move features further from the original than
  SSIM-matched uniform noise does.
- Test suite: 89 tests pass, 0 skipped (55 infrastructure and evaluation, 34 Style Shield).

## 4. Experiment design (actual run)

- Artwork: procedurally generated; four victim styles A1–A4; twelve candidate target styles.
  No third-party artwork.
- Protected artist: A1. Training: 12 images per victim class. Test: 12 held-out clean images per class.
- Probe: multinomial logistic regression on L2-normalised pooled `conv_pw_7_relu` features, Adam
  300 full-batch steps, L2 1e-4.
- Conditions: C0 clean; C1 A1 replaced by uniform noise matched in SSIM to each cloak; C2 A1
  replaced by its cloaks.
- Seeds: 0, 1, 2. Size 128 px. Preset balanced.
- Runtime: about 38 minutes total on one CPU core (about 70 s per image).
- Full output: `docs/experiments/style_shield_results.json`; log: `docs/experiments/run_log.txt`.

## 5. Results

**Visual quality (victim training pairs, Phase 2 metrics; mean across seeds):**

| Kind | SSIM | Mean abs diff (0–255) | Max abs diff (0–255) |
|---|---|---|---|
| Style Shield cloak | 0.899 | 2.93 | 8 |
| Matched noise control | 0.899 | 2.37 | 5 |

SSIM is matched by design. The cloak's maximum change reaches the 8/255 budget, as expected.

**Feature shift (mean L2 of pooled `conv_pw_7_relu`, victim images):**

| Kind | Mean | Range over seeds |
|---|---|---|
| Cloak vs original | 8.31 | 8.08–8.76 |
| Matched noise vs original | 1.76 | 1.75–1.79 |

**Effectiveness (victim recognition on clean held-out A1 images):**

| Condition | Victim recognition | Overall test accuracy |
|---|---|---|
| C0 clean | 1.000 (1.000–1.000) | 1.000 |
| C1 matched noise | 1.000 (1.000–1.000) | 1.000 |
| C2 Style Shield | 1.000 (1.000–1.000) | 1.000 |

Every condition classifies every held-out victim image correctly, in every seed.

## 6. Interpretation and limitations

**The experiment shows no effect, and it cannot show one.** The clean baseline already scores
100%, so the probe has no headroom to register a drop. The victim style is separable by palette
and mark-making, and those survive the cloak. Any conclusion about protection would be
unsupported by this run.

What the run does show:
- The optimiser changes features much more than SSIM-matched noise does (8.3 against 1.8). The
  cloak does what the optimisation asks.
- Feature change alone does not change this probe's decisions.

This is a **failed experiment**, not a success. Causes, in order of likelihood:
1. Saturated probe: the victim classes are too easy to tell apart on clean data.
2. The probe uses the optimiser's own frozen features, which is the most favourable setting for
   the cloak, and it still shows nothing.
3. The proxy measures classification, not generation. Glaze's effect is on generated output,
   which this experiment does not test.

Other limitations (all still apply):
- MobileNetV1 is a classifier, not a generative autoencoder. Results do not transfer to
  Stable Diffusion or other generators.
- No transfer to other architectures was tested.
- No human evaluation was performed. Glaze's reported effectiveness (artist-rated PSR and CLIP genre
  shift) is not reproduced here and must not be cited as a result of this software.
- Artwork is generated, not real paintings.
- The MobileNetV1 checkpoint's own licence statement was not located; see `STYLE_SHIELD_DESIGN.md`.

## 7. Recommended next experiment (not run)
- A harder victim: two victim classes that share a generator and differ only in palette, with
  fewer training images (for example 4 per class).
- A non-linear probe trained from scratch, which can learn structure the cloak changes.
- A second architecture for transfer (licence-checked weights required).
- A metric of generated output quality, which would need a generative model this environment cannot run.

## 8. Reproducibility
- Weights: `models/mobilenet_1_0_224_tf_no_top.h5`, SHA-256 `9f9cfd8c925431c06ce96744e1d201575f6a681bf38ae2de38e2ae8f7d7829d3`.
- Run: `python -m scripts.run_style_experiment --seeds 0 1 2 --size 128 --preset balanced`.
- Seeds, presets, probe settings and all per-seed results are stored in the JSON output.

## 9. Phase 2 addendum: exact-budget enforcement (measured finding)

Phase 2 added strict enforcement of the perturbation budget on the FINAL encoded output (not
just the pre-encoding cloak), per an explicit requirement to never silently exceed it.

**Measurement:** encoding the UNPERTURBED original image (zero perturbation) at maximum quality
already changes pixels by up to 29 levels (JPEG, quality 100) and 30 levels (WebP, quality 100)
out of 255, purely from the codec's own quantisation and chroma subsampling at edges. This
exceeds every preset's budget (4/8/16 levels).

**Consequence:** JPEG and plain (lossy) WebP output are refused with `422 budget_unsatisfiable`
before optimisation runs, for all three presets, as currently defined. Only PNG and lossless
WebP (`webp_lossless=true`) can currently satisfy the budget, because they introduce no codec
distortion.

**A related, separate bug was found and fixed in the same work:** the budget check originally
included fully transparent pixels (alpha=0). Lossless WebP's own encoder is free to alter colour
values at those pixels, since they are invisible — this is correct, standard WebP behaviour, not
a defect. The check now excludes alpha=0 pixels, matching the fact that the optimiser does not
perturb them either.

**What this means going forward:** if lossy-format output is wanted, either (a) the budget
definition must be loosened to accommodate each codec's own distortion (effectively presets
~2x wider than the current ones, based on this measurement), or (b) a per-format budget is
defined, or (c) JPEG/lossy-WebP output is dropped until there is a reason to support it. No
decision has been made; this is reported for review.
