# Model Licensing Status

**Date:** 2026-11-15  
**Gate state:** CLOSED — `licence_confirmed = False` in `app/engines/style_shield/weights.py`

---

## MobileNetV1 checkpoint

| Item | Detail |
|---|---|
| **File** | `mobilenet_1_0_224_tf_no_top.h5` |
| **SHA-256** | `9f9cfd8c925431c06ce96744e1d201575f6a681bf38ae2de38e2ae8f7d7829d3` |
| **Source** | `https://github.com/fchollet/deep-learning-models/releases/download/v0.6/` |
| **Architecture code** | MIT (fchollet/deep-learning-models) + Apache-2.0 (tensorflow/models TF-Slim) |
| **Trained weight values** | **NO EXPLICIT LICENCE LOCATED** |
| **Commercial use** | **NOT ESTABLISHED** |
| **Redistribution** | **NOT ESTABLISHED** |
| **Licence_confirmed flag** | `False` |
| **Production behaviour** | Returns `model_licence_unconfirmed`; engine disabled |

A draft licence-clarification request to `opensource@google.com` has been prepared at
`docs/ai-shield/MOBILENETV1_LICENCE_REQUEST.md`. It has not been sent. Owner review and
approval required before sending.

---

## MobileNetV2 investigation (potential replacement)

**Motivation:** If the MobileNetV1 licence cannot be established, MobileNetV2 via
`keras.applications.MobileNetV2` was identified as the architecturally closest alternative.

### Source-code licence
`keras/src/applications/mobilenet_v2.py` file header states: Apache-2.0. ✓

### Pretrained weight file licence
Keras application weights are stored at `storage.googleapis.com/tensorflow/keras-applications/`.
The Keras documentation page for MobileNetV2 does not state an explicit weight-file licence
separate from the code licence.

**Finding:** The same licence ambiguity that affects MobileNetV1 potentially applies to
MobileNetV2 weights distributed through Keras storage. The Apache-2.0 code licence does not
automatically cover separately distributed binary weight files unless explicitly stated.

**Status:** MobileNetV2 is NOT confirmed as a licensed replacement. The licence clarification
request (see `MOBILENETV1_LICENCE_REQUEST.md`) should explicitly ask whether Keras application
weights (MobileNetV1, MobileNetV2) are covered by Apache-2.0.

### Technical compatibility
MobileNetV2 is NOT a drop-in replacement for MobileNetV1 in this engine:
- Different intermediate layer names and shapes
- Different feature dimensions at the layers the engine extracts from
- Different normalisation (MobileNetV2 uses [-1,1]; MobileNetV1 uses [0,1])
- The protection algorithm's optimisation target depends on specific MobileNetV1 feature maps
- A backbone swap requires: new weight loading code, re-validation of perturbation budget
  behaviour, re-running all 42 model tests, re-running the effectiveness evaluation

**Recommendation:** Do not swap silently. Document and test any backbone change as a separate
engineering work item, after licence rights are confirmed.

---

## SqueezeNet 1.1 evaluator (confirmed)

| Item | Detail |
|---|---|
| **Role** | Independent evaluator (not used in production inference) |
| **Weight source** | torchvision `IMAGENET1K_V1` |
| **Licence** | BSD-3-Clause — confirmed in `pytorch/vision/LICENSE` |
| **Commercial use** | ✓ Permitted |
| **Status** | CONFIRMED — does not block deployment |

---

## Final recommendation

1. Send the prepared licence-clarification request (after owner review).
2. Extend the request to cover MobileNetV2 Keras weights as well.
3. If no response within 4 weeks, evaluate: (a) a backbone with an explicitly confirmed
   weight licence (e.g. EfficientNet-Lite from TF Hub with explicit Apache-2.0 weight statement),
   or (b) training a fresh backbone from scratch on a suitable open dataset.
4. Do not set `licence_confirmed = True` without documented written permission.
5. Do not distribute weight files in the Docker image or repository under any circumstances
   until rights are confirmed.
