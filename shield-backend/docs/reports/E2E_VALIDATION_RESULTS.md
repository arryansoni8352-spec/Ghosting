# Real End-to-End Validation Results (Phase 2)

Measured against the actual running FastAPI app (TestClient), with real encoded PNG/JPEG/WebP
files in RGB, grayscale (L), and RGBA (mixed and fully transparent alpha) modes. `low` preset,
default quality (92) for lossy formats, 64x64 generated artwork, 5 optimisation steps.

| Case | Submit | Final state | Output size | Mode | Budget m | Max change | Cleaned up |
|---|---|---|---|---|---|---|---|
| png->png (RGB) | 202 | succeeded | [64, 64] | RGB | 4 | 0 | True |
| png->png (L) | 202 | succeeded | [64, 64] | L | 4 | 0 | True |
| png->png (RGBA_mixed) | 202 | succeeded | [64, 64] | RGBA | 4 | 0 | True |
| png->png (RGBA_transparent) | 202 | succeeded | [64, 64] | RGBA | 4 | 0 | True |
| jpeg->jpeg (RGB) | 202 | failed | - | - | - | - | True |
| jpeg->jpeg (L) | 202 | failed | - | - | - | - | True |
| webp->webp (RGB) | 202 | failed | - | - | - | - | True |
| webp->webp (RGBA_mixed) | 202 | failed | - | - | - | - | True |
| webp->webp (L) | 202 | failed | - | - | - | - | True |

## Failures (by design)

- **jpeg->jpeg (RGB)**: `budget_unsatisfiable` — The jpeg codec alone changes pixels by up to 11 of 255 levels at quality 92, before any perturbation is added. The 'low' preset's budget is 4 levels, so it cannot be met. Use a higher quality, choose png, or set webp_lossless=true.
- **jpeg->jpeg (L)**: `budget_unsatisfiable` — The jpeg codec alone changes pixels by up to 5 of 255 levels at quality 92, before any perturbation is added. The 'low' preset's budget is 4 levels, so it cannot be met. Use a higher quality, choose png, or set webp_lossless=true.
- **webp->webp (RGB)**: `budget_unsatisfiable` — The webp codec alone changes pixels by up to 15 of 255 levels at quality 92, before any perturbation is added. The 'low' preset's budget is 4 levels, so it cannot be met. Use a higher quality, choose png, or set webp_lossless=true.
- **webp->webp (RGBA_mixed)**: `budget_unsatisfiable` — The webp codec alone changes pixels by up to 14 of 255 levels at quality 92, before any perturbation is added. The 'low' preset's budget is 4 levels, so it cannot be met. Use a higher quality, choose png, or set webp_lossless=true.
- **webp->webp (L)**: `budget_unsatisfiable` — The webp codec alone changes pixels by up to 6 of 255 levels at quality 92, before any perturbation is added. The 'low' preset's budget is 4 levels, so it cannot be met. Use a higher quality, choose png, or set webp_lossless=true.

All four PNG cases (RGB, grayscale, mixed-alpha RGBA, fully-transparent RGBA) succeeded
with zero measured deviation at 5 steps (optimisation barely perturbs in that few steps;
see `docs/experiments/style_shield_results.json` for the full 500-step results).
All five lossy-format cases (JPEG, plain WebP) correctly failed safely, per the
budget-enforcement finding in `docs/STYLE_SHIELD_TECHNICAL_REPORT.md` section 9.
Every job's temporary directory was confirmed removed after completion, success or failure.
