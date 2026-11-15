# Evaluation Harness (Phase 2)

Scope: measure **visual similarity** and **file size** between an original image and a derived
image. This phase implements no protection algorithm. Visual metrics never indicate whether an
AI model is affected; that is a separate, later evaluation.

## What is implemented

| Measure | Module | Notes |
|---|---|---|
| MSE | `app/evaluation/metrics.py` | On the 0..255 scale |
| MAD (mean absolute difference) | `metrics.py` | On the 0..255 scale |
| PSNR (dB) | `metrics.py` | `None` in reports when images are identical (infinite) |
| SSIM | `metrics.py` | Gaussian 11x11, sigma 1.5, K1 0.01, K2 0.03; per-channel mean for colour |
| Max single-channel change | `compare.py` | Largest absolute change, 0..255 |
| Dimensions | `compare.py`, `utils/images.py` | Exact width, height, channels; mismatches are refused |
| File sizes and size ratio | `compare.py` | Bytes of the encoded files |

LPIPS is **not implemented**. It needs pretrained network weights (typically AlexNet or VGG
backbones). We have not selected or verified a weights source and licence, so it is deferred.

## Decoding policy
All images are decoded to uint8 RGB. Transparent pixels are composited onto white. Grayscale
is expanded to three channels. EXIF orientation is applied first. This makes results
comparable across formats.

## Formats
- PNG: lossless. Round-trip gives zero difference (tested).
- JPEG: lossy, Pillow default subsampling. Quality 1-100 is required.
- WebP: lossy, Pillow method 4. Tested only where the installed Pillow has WebP support.

## Synthetic images (test material only)
Five deterministic kinds: `gradient`, `checkerboard`, `shapes`, `texture`, `photo_like`. They
exist to exercise the metrics and codecs. **They are not photographs or artworks, and results
on them must not be presented as representative of real images.**

## Baselines
`docs/baselines.json` holds metric values for 30 fixed cases (5 kinds x JPEG q95/q75/q40,
WebP q80, two seeded noise fixtures). Regenerate with:

```bash
python -m scripts.generate_baselines
```

The reproducibility test enforces the baselines only when the recorded Pillow and NumPy
versions match the running environment. Otherwise it is skipped, and the file should be
regenerated deliberately. The `fixture_noise` cases are measurement fixtures, not protection.

## Verification
- Closed-form tests: MAD, MSE and PSNR are checked against exact formulas.
- SSIM is cross-checked against scikit-image's reference implementation (BSD-3-Clause), to
  within 1e-6, on all synthetic kinds and on grayscale. The cross-check is skipped if
  scikit-image is not installed.
- A deliberate bug was injected into the SSIM constant; the cross-check tests failed, and the
  restored code passed. This shows the tests can detect a real error.

## Limitations of each metric

**MSE / PSNR**
- Pixel-wise and perceptually unaware. Two images with equal PSNR can look very different.
- PSNR is infinite for identical images, which is why it is reported as `null`.
- Dominated by a few large errors. A uniform shift and a localised change of the same total
  energy score differently, so PSNR alone cannot describe where a change is.

**MAD**
- Easy to interpret, but it averages over all pixels, so localised changes in faces or fine
  textures can be hidden by large flat areas.

**SSIM**
- Models local structure, contrast and luminance, which is closer to human perception than
  PSNR, but it is still a hand-designed model. It can rate some visible changes highly.
- Excludes a border of 5 px (valid region). Images smaller than 11 px are refused.
- A high SSIM **does not** show that any AI model is unaffected, and does not show protection.

**All visual metrics**
- Measure change between two specific images. They say nothing about recognition,
  imitation, or training behaviour.
- Depend on the decoding policy above. Different decoders or colour profiles can shift values.
- Lossy re-encoding (JPEG, WebP) changes values even when no protection is applied. Those
  codec effects must be measured as a baseline.

## What this phase does NOT show
- That any image is protected from facial recognition or style mimicry.
- That any perturbation is imperceptible to human observers in general. Visual metrics are
  proxies only; perceptual judgements need human studies.
- Anything about models, datasets or training.
