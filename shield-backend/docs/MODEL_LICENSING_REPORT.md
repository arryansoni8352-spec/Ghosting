# Model and Dependency Licensing Report

## Model weights

| Field | Value |
|---|---|
| Model | MobileNetV1, width 1.0, ImageNet classification, no top layer |
| Checkpoint file | `mobilenet_1_0_224_tf_no_top.h5` |
| Size | 17,225,924 bytes |
| SHA-256 | `9f9cfd8c925431c06ce96744e1d201575f6a681bf38ae2de38e2ae8f7d7829d3` |
| Packaging source | `fchollet/deep-learning-models`, GitHub release `v0.6` |
| Packaging licence | MIT (repository `LICENSE`, verified by reading the file) |
| Original checkpoint source | TensorFlow-Slim model zoo (`tensorflow/models`, `research/slim`) |
| Origin code licence | Apache-2.0 (`tensorflow/models/LICENSE`, verified by reading the file) |
| **Checkpoint's own licence statement** | **NOT LOCATED.** No explicit licence file or statement for the trained weight values (as distinct from the code) was found at either source. |
| Commercial use | **NOT ESTABLISHED.** Do not use in a commercial product until this is resolved. |
| Redistribution | **NOT ESTABLISHED.** This project does not redistribute the weights; they are downloaded by the user from the original source and verified by checksum. |
| Required attribution | Howard et al., "MobileNets: Efficient Convolutional Neural Networks for Mobile Vision Applications", 2017 (architecture). Credit the TensorFlow-Slim model zoo as the checkpoint's origin. |

**Consequence:** `production_mode` refuses to load this model (`ModelUnavailableError`) until
`WeightSpec.licence_confirmed` is set to `True`, which must only be done after a licence
statement is actually found or obtained. This is enforced in code
(`app/engines/style_shield/weights.py`, `app/engines/style_shield/engine.py`), not only in
documentation.

**Models considered and rejected:**
- VGG16 (Keras ImageNet weights): rejected. Official Oxford VGG sources give contradictory
  licence terms (CC BY 4.0 in one place, CC BY-NC 4.0 in another). A non-commercial term would
  block the stated use case.
- Stable Diffusion autoencoder, CLIP, torchvision LPIPS backbones: not used. Their weight hosts
  (Hugging Face, download.pytorch.org, openaipublic blob storage) were unreachable from the
  development sandbox, so their licences were never evaluated for this project.

## Code and library dependencies (verified with `pip-licenses`, this environment)

| Package | Version | Licence |
|---|---|---|
| fastapi | 0.162.0 | MIT |
| pydantic | 2.14.3 | MIT |
| pydantic-settings | 2.16.2 | MIT |
| uvicorn | 0.54.0 | BSD-3-Clause |
| python-multipart | 0.0.33 | Apache-2.0 |
| Pillow | 13.0.0 | MIT-CMU |
| numpy | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 (bundled components) |
| jax / jaxlib | 0.12.0.1 | Apache-2.0 |
| h5py | 3.16.0 | BSD-3-Clause |
| scikit-image (dev only) | 0.26.0 | BSD |
| pytest / httpx (dev only) | 9.2.0 / 0.28.1 | MIT / BSD |

All code dependencies are permissively licensed and compatible with a proprietary deployment.
**The checkpoint is the only unresolved item.**

## Action required before any commercial or production use
1. Obtain an explicit licence statement for the MobileNetV1 checkpoint from an authoritative
   source, or
2. Replace it with a checkpoint whose licence is confirmed compatible, and update
   `WeightSpec.licence_confirmed` only once that confirmation exists.
