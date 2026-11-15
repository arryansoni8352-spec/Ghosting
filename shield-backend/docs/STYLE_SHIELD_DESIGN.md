# Style Shield: Design (Glaze-inspired, independently implemented)

**This is NOT an exact reproduction of Glaze.** Glaze (Shan et al., USENIX Security 2023) uses
a Stable Diffusion feature extractor, a diffusion-based style transfer, and an LPIPS perceptual
bound. None of those components is available to this project (see `RESEARCH.md` §5). This design
keeps the structure of Glaze's objective, substitutes components we can license and run, and
labels every substitution. No Glaze numbers may be quoted as results of this software.

Status of this document: design, written before implementation. Changes after implementation
must be recorded here.

**Change recorded after implementation began: framework.** The design was first written against
PyTorch. PyTorch was then installed, but its Linux wheels require roughly 2.5 GB of CUDA libraries
at import time, even for CPU use. That did not fit the available disk (one attempt filled it and
killed the install). The implementation uses **JAX (CPU wheel)** instead. The model, the SSIM and
the objective are unchanged in definition. The MobileNetV1 port is checked against the original
Keras model (see §6). GPU execution is supported through JAX's CUDA plugin but was not tested,
because no GPU is available here.

---

## 1. Components and why each was chosen

### 1.1 Feature extractor Φ_A (the optimisation model): MobileNetV1, ImageNet

| Item | Value |
|---|---|
| Architecture | MobileNetV1 (Howard et al., 2017), width multiplier 1.0 |
| Weights | ImageNet-1k classification, Keras `mobilenet_1_0_224_tf_no_top.h5` |
| Source | GitHub release v0.6 of `fchollet/deep-learning-models` (repository MIT) |
| Original checkpoint | TensorFlow-Slim model zoo (`tensorflow/models`, research/slim) |
| Size | 17,225,924 bytes; 135 tensors (convolutions and batch-norm; classifier head removed) |
| Input | 224-scale weights, used at 128 px and 224 px; scaled to [-1, 1] (`x / 127.5 - 1`) |
| Licence (code) | Apache-2.0 for `tensorflow/models/research` (verified from the repository LICENSE) |
| Licence (checkpoint) | **Residual uncertainty.** The checkpoint's own licence statement was not located. It is distributed through the Apache-2.0 model zoo; we accept this with the uncertainty recorded. |

**Why this model:**
- **Available:** the weights are reachable from this sandbox (GitHub). VGG16 was rejected
  because its licence is contradictory across official sources (CC BY 4.0 in one place,
  CC BY-NC 4.0 in another). The Stable Diffusion VAE, CLIP and torchvision weights are blocked
  here.
- **Feasible on one CPU core with 3 GB RAM:** about 3.2M parameters for the convolutional part.
  Forward and backward passes at 128 px are practical; VGG16 would be roughly 20 times more costly.
- **Relevant features:** its intermediate depthwise-separable blocks encode texture and colour
  statistics. Those statistics are closely related to what artistic style looks like, unlike
  the identity features used in Fawkes.
- **Known mismatch:** Glaze's extractor is a generative autoencoder that is part of the
  text-to-image pipeline. MobileNetV1 is a classifier. Results on MobileNetV1 do not predict
  results against Stable Diffusion. This is the largest limitation of the design.

**Layers used for the objective:** `conv_pw_3_relu`, `conv_pw_5_relu`, `conv_pw_7_relu`
(mid-level blocks). Earlier layers are too close to raw pixels; the final layers are too
semantic. These layer choices are **our choice**, not Glaze's.

### 1.2 Style transfer Ω: Gatys-style neural style transfer using Φ_A

Glaze uses diffusion-based image-to-image style transfer. That model is not available here, so Ω
is replaced with the original Gram-matrix neural style transfer (Gatys et al., 2016), using the
same MobileNetV1 features.

| Setting | Value | Note |
|---|---|---|
| Content layer | `conv_pw_5_relu` | our choice |
| Style layers | `conv_pw_2_relu`, `conv_pw_4_relu`, `conv_pw_6_relu` | our choice |
| Content weight | 1.0 | our choice |
| Style weight | 1e4 | our choice |
| Optimiser | Adam, lr 0.02, 200 steps, pixel space clamped to [0,1] | our choice |

The style exemplar S_T for a target style T is a generated image (see §2.3), not a copyrighted
artwork.

### 1.3 Perceptual constraint: SSIM-based distance (not LPIPS)

Glaze bounds the cloak with LPIPS. LPIPS needs an ImageNet backbone (AlexNet, VGG or SqueezeNet)
whose weights are blocked here, and the published LPIPS linear heads are trained for those
backbones only. We therefore use:

- **Hard L∞ budget ε** on the cloak, enforced by construction (see §3.2).
- **Soft perceptual penalty** based on a differentiable SSIM: D_s(x, x') = (1 − SSIM(x, x')) / 2,
  on [0,1] images. This is the DSSIM convention; it is a **different quantity from Glaze's
  LPIPS**, and results must not be compared with Glaze's p values.

The SSIM used in the penalty is a JAX port of the Phase 2 SSIM (11×11 Gaussian, σ=1.5,
K1=0.01, K2=0.03). A test checks it against the NumPy implementation.

---

## 2. Data and experiments

### 2.1 Sample artwork (generated, no third-party images)
Procedural paintings from a seeded generator: brush-stroke fields, colour washes, and
hard-edged geometric compositions. Four **victim-artist styles** (A1 to A4) and twelve
**candidate target styles** (T1 to T12) are generated with distinct colour and stroke
parameters. The generator is in `app/evaluation/art_generator.py`.

**Limitation:** these are not real artworks. They test the mechanism only. Results on them do not
transfer to real art without further testing.

### 2.2 Target-style selection (Glaze §5.3, step 1, reimplemented)
For victim artist V:
1. Compute the Φ_A global-average-pooled feature centroid of each candidate style, using a fixed
   number of its images (we use 4).
2. Compute V's centroid from its images.
3. Keep candidates whose centroid distance to V lies between the **50th and 75th percentile**
   of all candidate distances.
4. Choose T uniformly at random from the kept set using a recorded seed.

### 2.3 Objective (per artwork x)

Cloak parameter w (unconstrained). Perturbation: δ = ε · tanh(w), so |δ| ≤ ε always. Cloaked
image: x' = clip(x + δ, 0, 1).

Loss:

L(w) = L_feat + α · max(D_s(x, x') − p_s, 0)

- **L_feat** = mean over layers l ∈ {conv_pw_3_relu, conv_pw_5_relu, conv_pw_7_relu} of
  ‖Φ_A^l(x') − Φ_A^l(Ω(x,T))‖²₂ / N_l, where N_l is the number of elements in layer l. This is
  the feature-space objective, normalised per layer so layers contribute comparably.
- **α** = perceptual penalty weight (our setting, see §4).
- **p_s** = perceptual budget on D_s (our setting, see §4).

Optimiser: **Adam** on w, learning rate η, fixed number of steps S. Initialisation: w = 0 (no
perturbation at the start), so every change comes from the gradient. No random noise is added
at any stage.

This structure follows Glaze's Eq. (2): a feature-space distance to a style-transferred target,
plus a penalty for exceeding a perceptual budget. Its feature extractor, perceptual measure,
constraint form, and penalty weights differ from Glaze's.

### 2.4 Experimental design: does the cloak change what a model learns?

**Named learner:** a multinomial logistic-regression probe on frozen Φ_A features (global
average pooling of `conv_pw_7_relu`), trained by Adam with fixed hyperparameters.

**Important:** the probe uses the same frozen model as the optimiser (white-box). It is a proxy
for a style-learning model, not a fine-tuned generative model. The experiment asks a narrower
question than Glaze's: whether a classifier trained on cloaked images recognises the victim's
clean style less often.

**Setup, per seed s ∈ {0, 1, 2}:**
- Four victim classes A1 to A4, each with 12 training and 12 held-out test images, generated
  from seeds derived from s.
- The protected artist is **A1**. Its 12 training images are cloaked.
- Training conditions:
  - **C0 (no protection):** all training images clean.
  - **C1 (random-noise control):** A1 training images replaced by random-noise images whose
    SSIM to the originals matches the cloaked images (random noise of matched SSIM, not raw noise).
  - **C2 (Style Shield):** A1 training images replaced by their cloaks.
- Test set: the 12 held-out **clean** A1 images, plus clean images of A2 to A4.

**Metrics (reported separately):**
- *Visual quality* (Phase 2 harness, on A1 training pairs): PSNR, SSIM, MAD, dimensions, sizes,
  D_s.
- *Adversarial effectiveness* (separate table):
  - **Victim recognition rate:** fraction of held-out clean A1 images the probe classifies as A1.
    A drop from C0 to C2 indicates the cloak changed what was learned. Compared with C1 to
    separate it from the effect of noise.
  - **Target shift rate: DROPPED.** The probe has only the four victim classes; the target style T
    is not a class, so this rate cannot be measured with this probe. Recorded here as a deviation
    from the original plan rather than reported as a result.
  - **Feature shift:** mean ‖Φ_A(x') − Φ_A(x)‖ on A1 training images, for C2 and C1.

**Statistics:** three seeds. Each reported figure has the mean and the range across seeds. With
12 test images per class and 3 seeds, differences of a few percent are not meaningful. Any
result should be read against the range, not as a point estimate.

---

## 3. Algorithm (what the code will do)

### 3.1 Per artwork
1. Load x in [0,1], shape 3×H×W.
2. Select target T by §2.2 (once per victim artist, shared across its artworks).
3. Compute Ω(x, T) by §1.2.
4. Initialise w = 0. For t = 1..S: δ = ε tanh(w); x' = clip(x + δ, 0, 1); compute L(w); Adam
   step on w.
5. Return x' rounded to 8 bits, the cloak δ, and a record: all parameters, model checksums, step
   count, final loss terms, wall-clock time, the random seeds, and device.

### 3.2 Enforcing the budget
|δ| ≤ ε holds by construction (tanh bounds δ). Rounding to 8 bits adds at most 0.5/255; the
rounded result is checked and re-clipped so that |x_out − x| ≤ ε + 1/255 in every pixel. The
test suite checks this on real outputs.

### 3.3 Protection strength presets (change real optimisation parameters)

| Preset | ε (L∞) | Steps S | Learning rate η | α | p_s | Purpose |
|---|---|---|---|---|---|---|
| low | 4/255 | 200 | 0.01 | 10.0 | 0.02 | prioritise similarity |
| balanced | 8/255 | 500 | 0.01 | 2.0 | 0.05 | trade-off (default) |
| high | 16/255 | 500 | 0.02 | 0.5 | 0.10 | prioritise the feature objective within limits |

All values are **our choices** and have not been tuned or validated against any published
result. They are configurable per request; advanced users may set ε, S, η, α and p_s directly
within limits given in the schema.

---

## 4. Substitutions from Glaze, summarised

| Glaze | This design | Reason |
|---|---|---|
| Φ = SD autoencoder-KL | Φ_A = MobileNetV1 | SD weights unreachable; licence chosen for availability |
| Ω = diffusion style transfer | Ω = Gatys transfer on Φ_A | Diffusion model unreachable |
| LPIPS perceptual bound, budget p | L∞ budget ε + differentiable SSIM distance D_s, budget p_s | LPIPS backbone weights unreachable |
| Target styles from WikiArt (1119) | 12 generated candidate styles | WikiArt terms unverified; no copyright-clear art here |
| Mimic = SD v2.1 fine-tuned 3000 steps | Probe on frozen Φ_A, 3 seeds | GPU and weight access unavailable |
| Artist-rated PSR (human study) | Not performed | Requires human participants |
| CLIP genre shift | Not performed | CLIP weights unreachable |

---

## 5. What the experiments can and cannot show
- They can show whether, under this setup, a proxy classifier's recognition of a generated
  victim style changes when trained on cloaks, and how that compares with noise of matched SSIM.
- They **cannot** show protection against Stable Diffusion, DALL·E, Midjourney or any
  fine-tuning pipeline. They do not measure human perception of style.
- They **cannot** establish that the effect generalises to real artwork.
- A null or weak result is a valid outcome and will be reported as such.

## 6. Verification performed during implementation
- MobileNetV1 port vs the original Keras model: max absolute difference 3.3e-5 at five depths
  (float32 precision). Reference activations are stored in `tests/fixtures/mobilenet_reference.npz`.
- JAX SSIM vs the Phase 2 NumPy SSIM: agreement within 1e-7 on tested pairs.
- Budget: |δ| ≤ ε holds on all tested outputs, including after 8-bit quantisation.
- Loss decreases under the optimiser; a cloak is closer to the target features than uniform noise
  of the same budget (tested on one pair).
- Grayscale -> WebP: channels can differ by up to ~2 levels due to WebP chroma subsampling (lossy codec effect, confirmed by comparing pre- and post-encode channel equality).

## 10. Phase 3 addendum: independent cross-model evaluation

The first evaluation (§5-6, this document's original sections) used a single linear probe on
MobileNetV1 features — the SAME model the cloak is optimised against. That is white-box
evaluation, and its hard-classification metric was saturated at 100% in every condition,
unable to show an effect either way (`docs/STYLE_SHIELD_TECHNICAL_REPORT.md`).

### 10.1 Independent evaluator model: SqueezeNet v1.1

Added specifically to avoid evaluating the cloak only against the model that produced it.

| Field | Value |
|---|---|
| Architecture | SqueezeNet v1.1 (Iandola et al., 2016): Fire modules (squeeze 1x1 + expand 1x1/3x3), plain ReLU with bias, **no batch normalisation** — structurally distinct from MobileNetV1's depthwise-separable + BatchNorm design |
| Weights | Converted from the original Caffe model, packaged by `rcmalli/keras-squeezenet` release v1.0 |
| Original lineage | `forresti/SqueezeNet` — the original authors' own repository |
| Licence (code) | MIT (`rcmalli/keras-squeezenet`, verified) |
| **Licence (checkpoint)** | **BSD-2-Clause, CONFIRMED** directly from `forresti/SqueezeNet`'s own `LICENSE` file, which covers the pretrained model file itself (unlike MobileNetV1's checkpoint, whose licence remains unresolved) |
| Preprocessing | Caffe-style: RGB→BGR, ImageNet BGR mean subtraction (`[103.939, 116.779, 123.68]`), no `[0,1]`/`[-1,1]` scaling — verified against an independent NumPy implementation, see below |

**Role:** independent evaluator ONLY. Never used by `optimise.py`'s cloak objective or by the
style-transfer target. The cloak is still optimised against MobileNetV1 alone.

### 10.2 Verification notes (an honest account, including a mistake)

The first attempt to generate reference activations built a small Keras reconstruction and
loaded weights with `load_weights(by_name=True)`. **This failed silently**: Keras layer names
cannot contain `/`, so the by-name matching against this weight file's `/`-containing group
paths never matched anything, and the "reference" was computed from randomly-initialised
layers. This was caught only because the JAX port disagreed with it by orders of magnitude,
prompting a third, independent check.

That third check — and the one now used to generate the permanent fixture
(`scripts/make_squeezenet_reference.py`) — is a from-scratch NumPy forward pass (im2col via
`sliding_window_view` + `einsum`, maxpool via a separate implementation), sharing no code with
the JAX port except the pure-HDF5 weight-loading function. It initially had its own bug (a
mis-specified `max` axis in the pooling function, collapsing the width dimension), caught
because it produced visibly wrong output shapes, and was fixed before being trusted. The JAX
port matches this independent implementation to float32 precision (max absolute error ~1e-3 on
activations in the hundreds to low thousands; relative error ~4e-7).

This episode is recorded in full because it is a direct illustration of why independent
verification matters, and because a verification script failing quietly is exactly the kind of
mistake this project's own brief asks to be reported honestly rather than hidden.

### 10.3 Evaluation framework (Part 4 of the brief)

Implemented in `scripts/run_independent_evaluation.py`:

- **Generation model:** MobileNetV1 (unchanged; the cloak's own optimiser).
- **Independent evaluator:** SqueezeNet v1.1, as above.
- **Effectiveness metrics**, computed on BOTH models for every condition:
  - Classification accuracy (linear probe, as in the first experiment).
  - Embedding similarity (cosine, pooled features) between each protected image and its own
    clean original.
  - Top-1 nearest-neighbour retrieval against a clean gallery (the held-out TEST set).
- **Robustness:** every effectiveness metric is also computed after two transforms applied to
  the protected image: a 2x downscale/upscale round trip, and JPEG recompression at quality 75.
- **Baselines:** C0 clean, C1 random noise matched in SSIM to the balanced preset's cloaks, and
  C2 at each of the three presets (low/balanced/high) — this project's one implementation at
  increasing strength, used as the "existing vs improved" axis the brief asks for, since there
  is no separate earlier version to compare against.
- **No data leakage:** the probe trains only on TRAIN images (clean/noise/cloak); it is tested
  only on held-out clean TEST images. The retrieval gallery is the clean TEST set; the query is
  the (possibly transformed) protected TRAIN images. Gallery and query never share an image.
- **Seeds:** 2 (reduced from the first experiment's 3, since this run covers 3 presets and 2
  evaluator models instead of 1 preset and 1 model — roughly 6x the compute per seed). Reported
  as mean/min/max, not as tight statistics; with 2 seeds, these ranges should be read as
  indicative, not confirmatory.

Results: `docs/experiments/independent_evaluation_results.json` (once the run completes).
