"""Generate tests/fixtures/squeezenet_reference.npz: an INDEPENDENT reference implementation of
SqueezeNet v1.1's forward pass, used to verify app/engines/style_shield/squeezenet.py (JAX).

HISTORY: the first attempt at this script built a Keras reconstruction and loaded weights with
`load_weights(by_name=True)`. That failed SILENTLY: Keras layer names cannot contain '/', so the
by-name matching against this weight file's '/'-containing group paths never matched, leaving the
Keras model at its random initialisation. This produced a reference that looked plausible (right
shapes) but was wrong by orders of magnitude — caught only by writing a THIRD, independent
check (see below) when the JAX port disagreed with it.

This version avoids Keras/TensorFlow entirely (also avoids the real risk of filling this sandbox's
disk, which happened once reinstalling TensorFlow for the MobileNet fixture). It is a from-scratch
NumPy forward pass (im2col via sliding_window_view + einsum for convolution, a separate maxpool),
sharing no code with the JAX implementation except the weight-loading function
(app.engines.style_shield.squeezenet.load_params, which is pure HDF5 reading, not computation).

Run from the project root, with the weights already downloaded to models/:
    python -m scripts.make_squeezenet_reference
"""
from __future__ import annotations

import pathlib

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from app.engines.style_shield.squeezenet import FIRE_BLOCKS, POOL_AFTER, load_params

MEAN_BGR = np.array([103.939, 116.779, 123.68], dtype=np.float64)
SIZE = 64
WEIGHTS = pathlib.Path(__file__).resolve().parent.parent / "models" / "squeezenet_v1.1_notop_imagenet.h5"
DEST = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "squeezenet_reference.npz"


def conv2d(x: np.ndarray, w: np.ndarray, b: np.ndarray, stride: int = 1, padding: str = "same") -> np.ndarray:
    kh, kw, cin, cout = w.shape
    if padding == "same":
        ph, pw = (kh - 1) // 2, (kw - 1) // 2
        x = np.pad(x, ((ph, ph), (pw, pw), (0, 0)))
    windows = sliding_window_view(x, (kh, kw, cin))[::stride, ::stride, 0]
    out = np.einsum("hwkjc,kjco->hwo", windows, w) + b
    return np.maximum(out, 0.0)


def maxpool_3_2_valid(x: np.ndarray) -> np.ndarray:
    c = x.shape[-1]
    windows = sliding_window_view(x, (3, 3, c))[::2, ::2, 0]
    return windows.max(axis=(2, 3))     # max over the (kh, kw) axes only


def fire(x, squeeze, expand1, expand3) -> np.ndarray:
    s = conv2d(x, *squeeze, stride=1, padding="valid")
    e1 = conv2d(s, *expand1, stride=1, padding="valid")
    e3 = conv2d(s, *expand3, stride=1, padding="same")
    return np.concatenate([e1, e3], axis=-1)


def main() -> None:
    params = load_params(WEIGHTS)
    conv1 = (np.asarray(params["conv1"][0]), np.asarray(params["conv1"][1]))
    fires = {n: {k: (np.asarray(v[0]), np.asarray(v[1])) for k, v in d.items()}
            for n, d in params["fires"].items()}

    rng = np.random.default_rng(0)
    img_u8 = rng.integers(0, 256, (1, SIZE, SIZE, 3), dtype=np.uint8)
    bgr = img_u8[0].astype(np.float64)[..., ::-1] - MEAN_BGR

    x = conv2d(bgr, *conv1, stride=2, padding="valid")
    x = maxpool_3_2_valid(x)
    taps = {}
    for name, _, _ in FIRE_BLOCKS:
        x = fire(x, fires[name]["squeeze1x1"], fires[name]["expand1x1"], fires[name]["expand3x3"])
        taps[name] = x.copy()
        if name in POOL_AFTER:
            x = maxpool_3_2_valid(x)

    out = {"input_uint8": img_u8}
    for name in ("fire2", "fire4", "fire6", "fire9"):
        out[name] = taps[name][None].astype(np.float32)
    DEST.write_bytes(b"")  # ensure parent exists via savez below
    np.savez_compressed(DEST, **out)
    print(f"wrote {DEST} with shapes:", {k: v.shape for k, v in out.items()})


if __name__ == "__main__":
    main()
