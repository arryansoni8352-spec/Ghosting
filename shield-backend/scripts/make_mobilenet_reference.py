"""Dev-time script: produce reference activations from the ORIGINAL Keras MobileNetV1.

HISTORICAL NOTE: this fixture was originally generated to verify a PyTorch port of MobileNetV1
(Phase 3, first attempt). The project now uses a JAX port (see app/engines/style_shield/mobilenet.py);
the SAME reference fixture is reused because it is independent of which framework reads it.

Run in an environment with tensorflow + tf-keras (NOT a project dependency):
    TF_USE_LEGACY_KERAS=1 python scripts/make_mobilenet_reference.py /path/to/mobilenet_1_0_224_tf_no_top.h5

The output tests/fixtures/mobilenet_reference.npz is then used by the test-suite, which checks the
JAX port against these activations without requiring TensorFlow (see HISTORICAL NOTE below).
"""
import pathlib
import sys

import numpy as np

os_env_note = "TF_USE_LEGACY_KERAS=1 must be set so tf_keras loads legacy HDF5 weights"
import tf_keras as keras  # noqa: E402

LAYERS = ["conv_pw_2_relu", "conv_pw_3_relu", "conv_pw_5_relu", "conv_pw_7_relu", "conv_pw_13_relu"]
SIZE = 64


def main(weights_path: str) -> None:
    rng = np.random.default_rng(0)
    img_u8 = rng.integers(0, 256, size=(1, SIZE, SIZE, 3), dtype=np.uint8)
    x = img_u8.astype(np.float32) / 127.5 - 1.0          # Keras MobileNet 'tf' preprocessing
    base = keras.applications.MobileNet(input_shape=(SIZE, SIZE, 3), include_top=False,
                                        weights=None)
    base.load_weights(weights_path)
    outputs = [base.get_layer(name).output for name in LAYERS]
    probe = keras.Model(base.input, outputs)
    acts = probe.predict(x, verbose=0)
    out = {"input_uint8": img_u8}
    for name, a in zip(LAYERS, acts):
        out[name] = a.astype(np.float32)
    dest = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "mobilenet_reference.npz"
    np.savez_compressed(dest, **out)
    print("wrote", dest, {k: v.shape for k, v in out.items()})


if __name__ == "__main__":
    main(sys.argv[1])
