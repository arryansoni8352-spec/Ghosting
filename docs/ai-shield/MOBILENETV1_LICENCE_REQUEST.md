# MobileNetV1 Checkpoint — Licence Clarification Request

**Status:** UNSENT — draft prepared, awaiting owner's review and approval before sending.  
**Date prepared:** 2026-11-15

---

## Background

GHOSTING AI Shield uses a pretrained MobileNetV1 feature extractor (`mobilenet_1_0_224_tf_no_top.h5`)
as the generation model in its image-protection pipeline. The checkpoint was obtained from the
`fchollet/deep-learning-models` repository on GitHub.

An investigation found:
- The packaging code is MIT licensed.
- The TensorFlow-Slim architecture code is Apache-2.0 licensed.
- **No explicit licence for the trained weight values themselves was located.**

The project currently disables this model in production via `licence_confirmed = False` in
`app/engines/style_shield/weights.py` and will not enable it until rights are confirmed.

**Checkpoint SHA-256:** `9f9cfd8c925431c06ce96744e1d201575f6a681bf38ae2de38e2ae8f7d7829d3`  
**Source URL:** `https://github.com/fchollet/deep-learning-models/releases/download/v0.6/mobilenet_1_0_224_tf_no_top.h5`

---

## Proposed enquiry

**To:** `opensource@google.com`  
**CC:** `fchollet` (GitHub) via issue on `fchollet/deep-learning-models`  
**Subject:** Licence clarification for MobileNetV1 pretrained checkpoint weights

---

Dear Google Open Source team,

We are developing an experimental image-protection research tool that uses the MobileNetV1
pretrained checkpoint distributed through the `fchollet/deep-learning-models` repository on GitHub.

Specifically:

- **Checkpoint file:** `mobilenet_1_0_224_tf_no_top.h5`
- **SHA-256:** `9f9cfd8c925431c06ce96744e1d201575f6a681bf38ae2de38e2ae8f7d7829d3`
- **Source:** `https://github.com/fchollet/deep-learning-models/releases/download/v0.6/`

The repository source code is MIT licensed, and the underlying TensorFlow-Slim model code
is Apache-2.0. However, we could not locate an explicit licence statement for the trained
weight values stored in this `.h5` file.

We would like clarification on the following points:

1. What licence applies to the trained weight values in this checkpoint?
2. Is commercial use of the weights (in a hosted web service) permitted?
3. Is redistribution of the weights (bundled in a Docker image or server package) permitted?
4. Are there attribution requirements we must satisfy?
5. If the weights are used to produce derived model outputs (protected images), do any
   licence conditions apply to those outputs?

Our intended use: the weights are loaded server-side to generate adversarial perturbations
for a research-stage image-protection feature. The service does not expose the weights to
end users. We do not intend to redistribute the weights directly.

We have currently disabled this model in production pending your response.

Thank you for your time.

---

## Alternative contact

If the above address is not appropriate, we will also file an issue on:
`https://github.com/fchollet/deep-learning-models/issues`

---

## Response log

| Date | Contact | Response | Action taken |
|---|---|---|---|
| (not yet sent) | | | |

---

## Current code enforcement

Until this form is completed and a response is recorded here:

- `WeightSpec.licence_confirmed = False` in `app/engines/style_shield/weights.py`
- Production mode returns `model_licence_unconfirmed` → engine disabled
- `SHIELD_ALLOW_WEIGHT_DOWNLOAD = false` by default
- No weight files are committed to the repository or included in the Docker image

**Do not set `licence_confirmed = True` without updating the response log above with
documented written permission from the rights holder.**
