"""Offline tests for the Phase 3 evaluation primitives (embeddings/retrieval math, transforms).
These do NOT need model weights: a tiny fake extractor stands in for a real one.
"""
import numpy as np
import pytest

from app.evaluation import robustness
from app.evaluation.embeddings import (
    Extractor, cosine_similarity_matrix, embed_many, nearest_neighbour_retrieval,
    pooled_embedding, top1_accuracy,
)


def _fake_features(params, x, layers):
    """A deterministic 'feature extractor': returns the mean colour as a 1x1xC feature map."""
    import jax.numpy as jnp
    mean = jnp.mean(x, axis=(1, 2), keepdims=True)  # 1x1x1xC
    return {layers[0]: mean}


def _to_array(arr_uint8):
    import jax.numpy as jnp
    return jnp.asarray(arr_uint8, dtype=jnp.float32)[None] / 255.0


FAKE = Extractor("fake", None, _fake_features, "layer", _to_array, role="independent")


def test_pooled_embedding_is_unit_norm():
    arr = np.random.default_rng(0).integers(0, 256, (16, 16, 3), dtype=np.uint8)
    emb = pooled_embedding(FAKE, arr)
    assert emb.shape == (3,)
    assert np.linalg.norm(emb) == pytest.approx(1.0, abs=1e-5)


def test_identical_images_give_cosine_similarity_one():
    arr = np.random.default_rng(1).integers(0, 256, (16, 16, 3), dtype=np.uint8)
    a = pooled_embedding(FAKE, arr)
    b = pooled_embedding(FAKE, arr)
    assert float(a @ b) == pytest.approx(1.0, abs=1e-5)


def test_cosine_similarity_matrix_shape():
    a = embed_many(FAKE, [np.full((8, 8, 3), c, np.uint8) for c in (10, 200)])
    b = embed_many(FAKE, [np.full((8, 8, 3), c, np.uint8) for c in (10, 200, 100)])
    sims = cosine_similarity_matrix(a, b)
    assert sims.shape == (2, 3)
    assert sims[0, 0] == pytest.approx(1.0, abs=1e-5)   # same colour, same embedding


def test_nearest_neighbour_retrieval_picks_closest():
    gallery = embed_many(FAKE, [np.full((8, 8, 3), c, np.uint8) for c in (0, 128, 255)])
    labels = [0, 1, 2]
    query = embed_many(FAKE, [np.full((8, 8, 3), 130, np.uint8)])  # closest to 128
    pred = nearest_neighbour_retrieval(query, gallery, labels)
    assert pred.tolist() == [1]


def test_top1_accuracy():
    assert top1_accuracy(np.array([0, 0, 1, 0]), 0) == 0.75
    assert top1_accuracy(np.array([1, 1]), 0) == 0.0


def test_resize_round_trip_preserves_shape_and_dtype():
    arr = np.random.default_rng(2).integers(0, 256, (40, 60, 3), dtype=np.uint8)
    out = robustness.resize_round_trip(arr, scale=0.5)
    assert out.shape == arr.shape and out.dtype == np.uint8


def test_jpeg_recompress_preserves_shape_changes_values():
    arr = np.random.default_rng(3).integers(0, 256, (32, 32, 3), dtype=np.uint8)
    out = robustness.jpeg_recompress(arr, quality=50)
    assert out.shape == arr.shape
    assert not np.array_equal(out, arr)   # lossy recompression should change something


def test_identity_transform_is_truly_identity():
    arr = np.random.default_rng(4).integers(0, 256, (20, 20, 3), dtype=np.uint8)
    assert np.array_equal(robustness.TRANSFORMS["none"](arr), arr)


def test_all_registered_transforms_are_shape_preserving():
    arr = np.random.default_rng(5).integers(0, 256, (24, 24, 3), dtype=np.uint8)
    for name, fn in robustness.TRANSFORMS.items():
        out = fn(arr)
        assert out.shape == arr.shape, name
        assert out.dtype == np.uint8, name
