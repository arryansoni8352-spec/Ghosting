"""The JAX SqueezeNet v1.1 port must reproduce an independent NumPy forward pass of the same
pretrained weights (see scripts/make_squeezenet_reference.py for why Keras verification was
abandoned for this model, and what went wrong on the first attempt).

SqueezeNet is used ONLY as an independent evaluator (Phase 3's cross-model check). It is never
the model the cloak is optimised against.
"""
import pathlib

import numpy as np
import pytest

pytestmark = pytest.mark.model

from app.engines.style_shield.weights import SQUEEZENET_V1_1_NOTOP, ensure_weights

FIXTURE = pathlib.Path(__file__).resolve().parents[1] / "fixtures" / "squeezenet_reference.npz"


@pytest.fixture(scope="module")
def params():
    from tests.conftest import require_model_weights
    path = require_model_weights(SQUEEZENET_V1_1_NOTOP)
    from app.engines.style_shield.squeezenet import load_squeezenet
    return load_squeezenet(path)


@pytest.mark.parametrize("layer", ["fire2", "fire4", "fire6", "fire9"])
def test_activations_match_independent_numpy_reference(params, layer):
    from app.engines.style_shield.squeezenet import features
    ref = np.load(FIXTURE)
    x01 = ref["input_uint8"].astype(np.float32) / 255.0
    got = np.asarray(features(params, x01, (layer,))[layer])
    expected = ref[layer]
    assert got.shape == expected.shape
    # float32 accumulation differences only; reference activations run into the hundreds/low thousands
    assert np.max(np.abs(got - expected)) < 1e-2


def test_unknown_layer_rejected(params):
    from app.engines.style_shield.squeezenet import features
    with pytest.raises(ValueError):
        features(params, np.zeros((1, 64, 64, 3), np.float32), ("fire99",))


def test_output_shape_for_64px(params):
    from app.engines.style_shield.squeezenet import features
    out = features(params, np.zeros((1, 64, 64, 3), np.float32), ("fire9",))
    assert out["fire9"].shape == (1, 3, 3, 512)


def test_preprocessing_is_caffe_style_not_mobilenet_style():
    """Must NOT reuse MobileNet's [-1,1] preprocessing: SqueezeNet needs Caffe-style BGR +
    ImageNet mean subtraction, since that's what its weights were trained with."""
    import jax.numpy as jnp
    from app.engines.style_shield.squeezenet import preprocess
    x = jnp.zeros((1, 8, 8, 3))
    out = preprocess(x)
    # at x=0 (black, RGB), expect BGR order with ImageNet means subtracted: [-103.939, -116.779, -123.68]
    assert float(out[0, 0, 0, 0]) == pytest.approx(-103.939, abs=1e-3)
    assert float(out[0, 0, 0, 2]) == pytest.approx(-123.68, abs=1e-3)
