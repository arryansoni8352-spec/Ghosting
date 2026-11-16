# Model Licensing Research

**Date:** 2026-11-15  
**Scope:** MobileNetV1 checkpoint used by the AI Shield image engine; alternative backbones.

---

## 1. MobileNetV1 checkpoint — current status

### What was searched

| Source | Finding |
|---|---|
| `fchollet/deep-learning-models` (GitHub) | Repository `LICENSE`: MIT. Covers the Python packaging code only. No explicit licence for the trained weight values. |
| `tensorflow/models` (GitHub) `research/slim/` | Repository `LICENSE`: Apache-2.0. Covers the model definition code. No explicit licence for the checkpoint weights. |
| `tensorflow/models/research/slim/README.md` | Lists pre-trained model zoos and download links. No licence statement for weight files. |
| Google AI Blog post introducing MobileNets (2017) | Describes the architecture. No licence terms stated. |
| Howard et al. 2017 arXiv paper | Academic licence (arXiv). Covers the paper, not the weights. |
| Keras documentation (legacy) | References the same weights. No licence statement. |

### Finding

**The trained weight values have no located explicit licence.**

The code that defines the architecture (Apache-2.0) and the code that packages the checkpoint (MIT) are both
permissively licensed. However, neither licence explicitly covers the trained parameter values stored in the
`.h5` file. Trained weights are potentially subject to separate intellectual-property treatment depending on
jurisdiction; the absence of an explicit licence does not mean they are freely usable.

### Commercial use
**NOT ESTABLISHED.** Do not use in a commercial service until an explicit, documented licence is obtained.

### Redistribution
**NOT ESTABLISHED.** The project does not redistribute the weights — they are downloaded by the user from the
original source and verified by checksum. That does not resolve whether using them in a hosted service
constitutes a form of redistribution under any applicable law.

### Code enforcement
`MOBILENET_V1_NOTOP.licence_confirmed = False` in `app/engines/style_shield/weights.py`.
`production_mode=true` causes `readiness()` to return `{"ready": false, "code": "model_licence_unconfirmed"}`.
The engine cannot be enabled in production without changing this field in source code — a deliberate,
auditable gate.

---

## 2. Resolution paths

### Path A — Obtain explicit licence from Google/TensorFlow (preferred)

1. File an issue on `tensorflow/models` or `fchollet/deep-learning-models` requesting an explicit licence
   for the checkpoint weights. Many similar requests have resulted in Apache-2.0 clarifications.
2. Email `opensource@google.com` referencing the specific checkpoint SHA-256
   `9f9cfd8c925431c06ce96744e1d201575f6a681bf38ae2de38e2ae8f7d7829d3`.
3. If Apache-2.0 or MIT is confirmed in writing, update `licence_confirmed = True` and document the response.

### Path B — Replace the backbone (recommended if Path A takes more than a few weeks)

The engine's design isolates the backbone behind a `WeightSpec` interface. Swapping it requires:
1. Identifying a replacement with a confirmed compatible licence (see §3).
2. Re-running the full optimisation loop to verify the perturbation budget still holds.
3. Re-running `pytest -m model`.
4. Re-running the effectiveness evaluation (which currently shows a null result regardless of backbone).

A backbone swap does **not** automatically fix the null effectiveness result. It resolves only the legal blocker.

---

## 3. Legally usable alternative backbones

The engine uses JAX and loads weights via the `h5py`/Keras HDF5 format. Suitable replacements must be:
- Available as pre-trained ImageNet classifiers
- Loadable in JAX (via Keras 3 with JAX backend, or converted from TF SavedModel)
- Explicitly licensed for commercial use

| Backbone | Weight source | Licence | JAX-loadable | Notes |
|---|---|---|---|---|
| **MobileNetV2** (`keras.applications.MobileNetV2`) | Keras storage (storage.googleapis.com) | Apache-2.0 — explicitly stated in `keras/src/applications/mobilenet_v2.py` header | ✓ via Keras 3 + JAX backend | Closest architecture to MobileNetV1; same ImageNet classification head |
| **EfficientNet-B0** (`keras.applications.EfficientNetB0`) | Keras storage | Apache-2.0 — same header pattern | ✓ via Keras 3 | Larger, potentially more discriminative features |
| **MobileNetV3-Small** (torchvision `IMAGENET1K_V1`) | PyTorch storage | BSD-3-Clause (`pytorch/vision LICENSE`) — explicitly confirmed | Needs conversion | torchvision not installed; requires `torch2jax` or ONNX export |
| **SqueezeNet 1.1** (already in this project as the evaluator) | torchvision `IMAGENET1K_V1` | BSD-3-Clause | Needs conversion | Architecture differences may affect style-cloaking quality |

**Recommended replacement if Path A fails:** `keras.applications.MobileNetV2`
- Architecturally closest to MobileNetV1
- Same Keras HDF5 load path; engine adapter changes are minimal
- Apache-2.0 is explicitly stated in the Keras source (not just inferred from the repo licence)
- Keras 3 runs on JAX natively (`os.environ["KERAS_BACKEND"] = "jax"`)

**Do not substitute without testing.** Any backbone swap requires:
```
1. Install keras>=3.0 with JAX backend
2. Update app/engines/style_shield/weights.py (new WeightSpec, new SHA-256)
3. Update app/engines/style_shield/engine.py (load MobileNetV2 features instead)
4. Update app/config/settings.py (licence_confirmed gating)
5. Run pytest -m model (all 42 tests)
6. Run scripts/evaluate_video_temporal.py
7. Re-run effectiveness evaluation
8. Document the change and the new licence evidence
```

---

## 4. SqueezeNet 1.1 evaluator (already confirmed)

The independent evaluator checkpoint (used in the evaluation suite, not in production inference) is
SqueezeNet 1.1 from torchvision `IMAGENET1K_V1`, BSD-3-Clause.
Licence source: `https://github.com/pytorch/vision/blob/main/LICENSE` — confirmed by reading the file.
This checkpoint is **not** the generation model and does not affect the production deployment blocker.

---

## 5. Summary table

| Item | Licence status | Commercial use | Blocks deployment? |
|---|---|---|---|
| MobileNetV1 `.h5` weights | **UNRESOLVED** | Not established | **YES** |
| Engine code (this project) | MIT (new code) / Apache-2.0 (JAX) | ✓ | No |
| All other backend dependencies | Permissive (MIT/Apache/BSD) | ✓ | No |
| SqueezeNet 1.1 evaluator | BSD-3-Clause | ✓ | No (not production) |
| MobileNetV2 (potential replacement) | Apache-2.0 (confirmed) | ✓ | — |

---

## 6. Required action before enabling the engine

Exactly one of:
1. Obtain written confirmation from Google/TensorFlow that the MobileNetV1 checkpoint is Apache-2.0
   or otherwise explicitly permissively licensed for commercial and hosted use.
2. Replace the backbone with MobileNetV2 (or another confirmed entry from §3), re-test, and document
   the change with its licence evidence.

Until then, `WeightSpec.licence_confirmed` must remain `False`.
