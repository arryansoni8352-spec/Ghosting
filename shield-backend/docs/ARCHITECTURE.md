# Architecture: GHOSTING Shield (standalone)

## Principles
- Two independent engines: **Face Shield** and **Style Shield**. They share utilities and an
  API layer but no optimisation code.
- Engines are behind a common interface, so the API does not depend on either implementation.
- Nothing is optimised until Phase 2. Phase 1 contains only typed interfaces and stubs that
  raise `NotImplementedError`, so no fake protection can be returned by accident.
- GPU-ready: device is chosen from configuration with CPU fallback.
- Standalone: no imports from, and no changes to, the GHOSTING website or its repository.

## Layers

```
app/api/          FastAPI routes (health, models, protect endpoints added later)
app/schemas/      Pydantic request/response models and enums
app/config/       Settings (pydantic-settings), environment loading
app/core/         Engine interface, device selection, errors, registry
app/engines/
  face_shield/    Face Shield engine (Phase 2+)
  style_shield/   Style Shield engine (Phase 3+)
app/evaluation/   Metrics: PSNR, SSIM, MAD, file sizes, LPIPS (later); protection tests (later)
app/utils/        Image I/O, validation, dimension and format helpers
tests/            pytest suite
scripts/          Local helper scripts
docs/             Research, architecture, integration notes
```

## Engine interface (defined in Phase 1)
Each engine implements:
- `name`: identifier, e.g. `face_shield`
- `describe()`: model names, versions, licences, target scenarios, limitations
- `protect(image, options)`: returns a protected image and a report (implemented in Phase 2/3)

## Dependency isolation
The ML stack (JAX, jaxlib, h5py) is an optional extra (`requirements-ml.txt`). Offline tests
(the `not model` marker) run without it; model-dependent tests require it and verified weights.
**HISTORICAL:** Phase 3 first used PyTorch, which was replaced by JAX because PyTorch's Linux
wheels require ~2.5 GB of CUDA libraries even for CPU use (see docs/STYLE_SHIELD_DESIGN.md).

## Phase boundaries
| Phase | Scope | Status |
|---|---|---|
| 1 | Research, scaffolding, schemas, config, API skeleton, docs | Approved |
| 2 | Evaluation harness (MSE, PSNR, SSIM, MAD, sizes) with codec and baseline tests | Complete, pending review |
| 3 | Style Shield optimisation | BLOCKED (see STYLE_SHIELD_TECHNICAL_REPORT.md) |
| 4 | Face Shield optimisation | Pending |
| 5 | Protection strength presets, effectiveness testing | Pending |
