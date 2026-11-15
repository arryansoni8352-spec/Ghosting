# Research Findings: Fawkes and Glaze

Status as of Phase 3 review. Sources checked in this sandbox on 2026-11-06.
Nothing in this file is an implementation. Items marked **UNVERIFIED** or **UNSPECIFIED** must
not be treated as known.

- **Reported** = a number or claim made by the paper's authors. We have not reproduced it.
- **Verified** = we measured it ourselves in this project. Nothing is verified yet for protection.

---

## 1. Fawkes (Face Shield basis)

**Paper:** Shan, Wenger, Zhang, Li, Zheng, Zhao. *Fawkes: Protecting Personal Privacy against
Unauthorized Deep Learning Models.* USENIX Security 2020. arXiv:2002.08327.
**Official code:** https://github.com/Shawn-Shan/fawkes, **BSD-3-Clause** (repository and
PyPI metadata).

### Algorithm (as described by the authors)
- Adds pixel-level "cloaks" to a user's own photos. The cloak moves the image's representation
  in a face recognition model's feature space, using a third party's image as a target.
- Cloaked images used to train a recognition model are reported to yield a model that
  misidentifies the protected person.

### Constraint and results: reported vs. verified

| Claim | Status |
|---|---|
| Perturbations keep DSSIM ≤ 0.007 | **Reported** by authors. The exact DSSIM formula must be confirmed from the paper before comparing numbers. **Not verified by us.** |
| 80%+ protection success with clean leaked images | **Reported** by authors (abstract). **Not verified.** |
| 100% success against certain commercial recognition services | **Reported** by authors (abstract). **Not verified.** |
| Modes low / mid / high map to increasing protection | **Reported** in repository text. **Not verified.** |
| Whether a given cloak protects a given person against a given model | **Not verified by us at all.** Planned for Phase 5. |

### Dependencies
- Official package is CPU-oriented. The README says GPU use needs a clone and a swap from
  `tensorflow` to `tensorflow-gpu`. **UNVERIFIED:** pinned versions in the current `setup.py`.
- Official runtime: about 60 seconds per image on CPU (repository figure, reported).

### Limitations stated by the authors
- Protection testing scripts were described as "coming soon" in the repository. Any protection
  claim is unverified until we measure it.
- Stated scope: personal privacy protection and academic research.

---

## 2. Glaze (Style Shield basis)

**Paper:** Shan, Cryan, Wenger, Zheng, Hanocka, Zhao. *Glaze: Protecting Artists from Style
Mimicry by Text-to-Image Models.* USENIX Security 2023. arXiv:2302.04222 (v6 read in full in
this phase).
**Official project:** https://glaze.cs.uchicago.edu/
**Official code:** the GitHub repository is **archived (read-only since 2023-03-24)**. The
paper does not publish an algorithm reference implementation. The public tool is a desktop
application.

### 2.1 Pipeline (as the paper describes it)

Given an artist V's artwork x, the artist's style-transfer target T, a feature extractor Φ, a
style-transfer model Ω, and a perturbation budget p:

1. **Target selection (§5.3, Step 1).** Candidate styles are drawn from WikiArt-based queries
   (1119 candidate styles, paper §6.1). For each candidate, a few images are used to compute a
   centroid in Φ-space. V's centroid is computed from V's artwork. Candidates whose centroid
   distance to V lies between the **50th and 75th percentile** are kept. T is then picked
   **at random** from that set. The paper states that artists should use the same T for all
   their artwork.
2. **Style transfer (§5.3, Step 2).** Ω(x, T) is produced by the diffusion model's style-transfer
   mode, conditioned on a text prompt describing T (the paper cites Palette [72] and the
   latent diffusion model [67]).
3. **Cloak optimisation (§5.3, Step 3).** For each x, optimise a perturbation δ_x (Eq. 1, 2):

   Eq. (1), as printed: min over δ of Dist(Φ(x + δ), Φ(Ω(x, T))) subject to |δ| < p.

   Eq. (2), as printed (penalty method, Nocedal & Wright [56]):

   min over δ of ‖Φ(Ω(x,T)) − Φ(x + δ)‖²₂ + α · max(LPIPS(δ) − p, 0)

   - Dist is squared L2 in Φ-space. This is the **only feature-space term**.
   - The LPIPS penalty is written as LPIPS(δ). LPIPS is a distance between **two images**, so
     the operational form is most plausibly LPIPS(x, x + δ). **This reading is an
     interpretation, not stated by the paper.**
   - α controls the penalty weight. **UNSPECIFIED** in the paper.
   - Optimiser: **Adam, 500 steps** (§6.1). **Learning rate UNSPECIFIED.**
4. **Upload.** The cloaked image is published. The original stays with the artist.

### 2.2 Feature extractor Φ

- The paper uses **Stable Diffusion's feature extractor** for the main experiments (§5.3, §6.1),
  and says a single model can supply both Φ and Ω.
- §6.4 names the SD extractor as **"Φ-A: autoencoder-KL [67]"** (latent diffusion VAE encoder,
  cited as Rombach et al., CVPR 2022). Other extractors tested: Φ-B (VQ-VAE [65]), Φ-C (a
  second autoencoder trained on CelebA [48]).
- **Inconsistency in the paper:** §6.1 describes "SD's feature extractor (ViT model with
  83 million parameters)". §6.4 calls the same extractor an autoencoder-KL. The parameter count
  is close to the SD VAE encoder, but "ViT" conflicts with §6.4. **We have not resolved this.**
  It must be checked against the official SD release before implementation.
- **UNSPECIFIED:** which layer or tensor of Φ is used (full latent, pooled, or a particular
  block), input normalisation, and input resolution handling for 512 to 6000 px images.

### 2.3 Perturbation constraint
- Budget p is measured with **LPIPS** (Zhang et al., CVPR 2018, [106]), chosen because
  "LPIPS has gained popularity as a measure of user-perceived image distortion".
- Values tested: p = 0.03, 0.05 (default), 0.1, 0.2. Default is 0.05 (§6.3).
- **UNSPECIFIED:** the LPIPS backbone (the `lpips` package defaults to AlexNet; that is the
  package's default, not a choice documented by Glaze), the layers used, the image range fed to
  LPIPS, and whether δ is clipped to the valid pixel range or parameterised (e.g. tanh) during
  optimisation.

### 2.4 Style transfer Ω
- Prompt-conditioned diffusion image-to-image, default SD functionality.
- **UNSPECIFIED:** strength, number of steps, guidance scale, prompt template, and random seed.

### 2.5 Runtime (authors' figures, reported)
- About 1.2 minutes per artwork on a Titan RTX GPU, and 7.3 minutes on a single Intel i7 CPU,
  for 500 Adam steps with SD's feature extractor (§6.1). Resolutions 512 to 6000 px.

### 2.6 Evaluation methodology (as the paper describes it)

Two metrics, both needing components we cannot reproduce here:

- **Artist-rated protection success rate (PSR).** Human artists rate mimicked art on a 5-level
  Likert scale. Requires an IRB-approved user study (1,156 artists in Survey 1). **Not
  reproducible in this project.**
- **CLIP-based genre shift.** Percentage of mimicked images whose CLIP top-3 genre predictions
  exclude the victim's genre. Uses 27 WikiArt historical genres and 13 digital genres. The
  paper reports CLIP top-3 accuracy of 96.4% on WikiArt and 94.2% on ArtStation (Appendix A.3).
  **The CLIP checkpoint is not named in the paper text.** The metric depends on a **mimic
  model**, which needs the mimicry attack below.

Mimicry attack used for evaluation (§6.1):
- Captions by an image captioning model (cited as VC-GPT [49]); artist name appended.
- Fine-tuning of SD v2.1 on 80% of each artist's artwork for **3000 steps**, learning rate
  5e-6, batch size 32, PNDM sampler with 50 steps. Five images generated per caption.
- Historical artists: 195 artists from **WikiArt** [73], 30 pieces sampled per artist. The
  WikiArt licence and terms are **UNVERIFIED** for our use.
- Four current artists provided 26 to 34 private works each (not available to us).

Authors' reported results (**reported, not verified**):
- Table 2, SD, current artists: artist-rated PSR 4.6% without Glaze, 94.3% with Glaze at p=0.05.
  CLIP genre shift 2.4% without, 96.4% with.
- Table 3: artist-rated PSR 93.3% at p=0.05, 95.9% at p=0.1, 96.1% at p=0.2.
- Robustness (reported): PSR above 87.4% under Gaussian noise and JPEG; above 85.3% with
  denoising and upscaling; above 88.7% under robust training (§7).
- Countermeasures reported to fail against Glaze: pixel smoothing, PEZ, and outlier detection
  (precision below 65%, recall below 53%).
- Adaptive countermeasure results cover a mimic that has white-box access to Glaze's
  extractor. The paper uses artist-rated PSR for these results.

### 2.7 Limitations stated by the authors (§8)
- Relies on artists cloaking enough of their art in the mimic's training data.
- Not future-proof. The authors say it "is not a permanent solution".
- Established artists' older, uncloaked work may already be in training sets.

### 2.8 What the paper does NOT provide (blockers for reproduction)

| Missing detail | Why it matters |
|---|---|
| α (penalty weight) | Sets the balance between feature shift and LPIPS bound. Changes results directly. |
| Adam learning rate | Controls convergence in 500 steps. |
| Perturbation parameterisation and clipping | Decides whether the LPIPS bound is actually enforced. |
| LPIPS backbone, layers, and input range | Changes what "p" means numerically. |
| Which Φ tensor is optimised; resolution handling | Changes the objective itself. |
| Style-transfer settings (strength, steps, guidance, prompt template) | Changes Ω(x, T), the optimisation target. |
| Candidate-style list (1119) and centroid sample size | Changes which T is chosen. |
| CLIP checkpoint used for genre shift | Changes the empirical metric. |
| Inconsistency in the description of Φ ("ViT" vs autoencoder-KL) | Must be resolved against the official SD release. |
| Official source code | Archived repository, no algorithm reference implementation in the paper. |

---

## 3. Technical differences

| Aspect | Fawkes | Glaze |
|---|---|---|
| Domain | Faces (identity) | Artwork (style) |
| Feature-space objective | Identity features toward a target identity | Feature shift toward a **style-transferred** version of the same artwork |
| Target construction | Third party's image | Ω(x, T) from a randomly chosen target style |
| Perceptual bound | DSSIM ≤ 0.007 (reported) | LPIPS penalty with budget p (0.05 default, reported) |
| Optimiser | Not confirmed here | Adam, 500 steps |
| Evaluation | Recognition accuracy (reported) | Artist-rated PSR and CLIP genre shift (reported) |
| Licence (code) | BSD-3-Clause (confirmed) | Not confirmed; official repo archived |

---

## 4. Licences and availability of required components

| Component | Licence | Verification | Sandbox availability |
|---|---|---|---|
| Glaze code | Not published as reusable source | Repository archived; no licence confirmed | n/a |
| Fawkes code | BSD-3-Clause | Repository and PyPI metadata | Not used |
| Stable Diffusion code (CompVis) | **CreativeML Open RAIL-M** (use restrictions) | Read from GitHub LICENSE | Reachable |
| Stable Diffusion weights (VAE, SD 2.1) | **UNVERIFIED** | Hosted on Hugging Face; not reachable | **Blocked** |
| LPIPS code | BSD License | PyPI classifier; repo LICENSE header read | Reachable (PyPI, GitHub) |
| LPIPS backbone weights (torchvision AlexNet/VGG) | **UNVERIFIED** | Hosted on download.pytorch.org | **Blocked** |
| OpenAI CLIP code | MIT | Read from GitHub LICENSE | Reachable |
| OpenAI CLIP weights | **UNVERIFIED** | Hosted on openaipublic blob storage | **Blocked** |
| WikiArt dataset | **UNVERIFIED** | Terms not checked | Not checked |
| PyTorch | BSD-3-Clause | Standard; not re-checked here | Installable from PyPI |
| scikit-image | BSD-3-Clause | Dev-only | Installed |

Conclusion on licences: the code-level components we would use are licence-compatible with a
proprietary project, **with the exception of SD code and weights, which carry use restrictions
that must be read in full before any use**. The weights are unverified and cannot be fetched
from this environment.

---

## 5. Blockers for Style Shield (as of this review)

1. **Model weights cannot be loaded here.** The feature extractor (SD autoencoder-KL) and style
   transfer model (SD) are hosted on Hugging Face, which is unreachable from this sandbox. The
   LPIPS backbone and CLIP weights are also unreachable. No pretrained weight file can be
   loaded in this environment.
2. **Methodology is incomplete on the points that decide the result.** α, the learning rate,
   the perturbation parameterisation, the LPIPS configuration, the Φ tensor, and the style
   transfer settings are not specified. Choosing them ourselves would be guessing, which the
   brief forbids.
3. **Evaluation is not reproducible here.** Artist-rated PSR needs a human user study. CLIP
   genre shift needs a mimic model fine-tuned on WikiArt for 3000 steps (GPU-heavy) and an
   unnamed CLIP checkpoint.
4. **Internal inconsistency** about Φ's architecture must be resolved before implementation.

---

## 6. What can be reproduced, and what cannot

**Can be reproduced from the paper's description (once weights are available):**
- The penalty-method objective structure in Eq. (2): feature-space L2 term plus LPIPS penalty.
- The target-style selection rule (percentile band, random choice), given a candidate list.
- Use of Adam with a fixed step count, and the penalty weight α as a tunable parameter.
- The budget scale p as an LPIPS threshold, with the LPIPS configuration fixed by us and
  documented.
- Measurement of visual quality with our Phase 2 harness (PSNR, SSIM, MAD, sizes).

**Cannot be reproduced from the paper as written:**
- The exact numerical behaviour of Glaze, because α, the learning rate, and the parameterisation
  are unspecified.
- The exact target Ω(x, T) without the style-transfer settings and the prompt template.
- The artist-rated PSR and the CLIP genre-shift results.
- Any claim that our output matches Glaze's output.

**Any implementation we build from the reproducible parts must be labelled as a Glaze-inspired
method with our own documented hyperparameters, not as a reproduction of Glaze.**

---

## 7. Decision needed before Style Shield can proceed

Choose one, or propose another:

- **Option A (faithful but limited):** Accept that an implementation would use our own choices
  for the unspecified parameters, label them, and treat it as "Glaze-inspired". This requires
  the weights to be placed on the owner's machine, since this sandbox cannot download them.
- **Option B (wait for the source):** Hold Style Shield until the Glaze team's implementation
  or a licence-cleared reference becomes available. The archived repository and the paper do
  not provide enough detail to match Glaze's behaviour.
- **Option C (different extractor):** Choose an open-weights extractor with a clear licence and
  accept that Glaze's published method would then not be the basis.

No option has been started.
