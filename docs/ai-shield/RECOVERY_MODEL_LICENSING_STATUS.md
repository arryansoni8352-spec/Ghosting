# MODEL_LICENSING_STATUS

## MobileNetV1 checkpoint
| Field | Value |
|-------|-------|
| File | `mobilenet_1_0_224_tf_no_top.h5` |
| SHA-256 | `9f9cfd8c925431c06ce96744e1d201575f6a681bf38ae2de38e2ae8f7d7829d3` |
| URL | https://github.com/fchollet/deep-learning-models/releases/download/v0.6/mobilenet_1_0_224_tf_no_top.h5 |
| Packaging | fchollet/deep-learning-models (MIT for packaging code) |
| Origin code lineage | TF-Slim / tensorflow/models (Apache-2.0 for code) |
| **licence_confirmed** | **False** |
| licence_weights | UNRESOLVED — explicit checkpoint licence statement not located |

## Enforcement (kept closed)
- Production mode refuses load when `licence_confirmed=False`.
- `SHIELD_ALLOW_WEIGHT_DOWNLOAD` defaults to false.
- Weights never baked into the image.
- Frontend and capabilities endpoint report the limitation honestly.

## MobileNetV2
Not adopted. Keras Applications source licence does not automatically prove commercial redistribution rights for every pretrained weight file. Technical compatibility of intermediate activations used by the protection method would also need re-validation.

## Recommendation
Do not enable production inference. Document any rights-holder response before flipping `licence_confirmed`.
