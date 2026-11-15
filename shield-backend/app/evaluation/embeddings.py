"""Model-agnostic embedding extraction, similarity and retrieval, for the independent evaluation
framework (Phase 3). Works with any feature extractor exposing a `features(params, x01, layers)`
function returning pooled-able activations — used with both MobileNetV1 (the generation model)
and SqueezeNet (the independent evaluator), so the same evaluation code runs on both without
favouring either.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import jax.numpy as jnp
import numpy as np


@dataclass(frozen=True)
class Extractor:
    """A named, pluggable feature extractor for evaluation."""
    name: str
    params: object
    features_fn: Callable
    layer: str
    to_array: Callable            # uint8 HWC -> model input array
    role: str                     # "generation" | "independent"


def pooled_embedding(ext: Extractor, arr_uint8: np.ndarray) -> np.ndarray:
    x = ext.to_array(arr_uint8)
    f = ext.features_fn(ext.params, x, (ext.layer,))[ext.layer]
    v = jnp.mean(f, axis=(1, 2))[0]
    v = v / (jnp.linalg.norm(v) + 1e-9)
    return np.asarray(v)


def embed_many(ext: Extractor, arrays: list[np.ndarray]) -> np.ndarray:
    return np.stack([pooled_embedding(ext, a) for a in arrays])


def cosine_similarity_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Both inputs are L2-normalised (pooled_embedding already normalises); plain dot product."""
    return a @ b.T


def nearest_neighbour_retrieval(query_embs: np.ndarray, gallery_embs: np.ndarray,
                                gallery_labels: list[int]) -> np.ndarray:
    """For each query, the label of its closest gallery embedding (cosine similarity)."""
    sims = cosine_similarity_matrix(query_embs, gallery_embs)
    nearest = np.argmax(sims, axis=1)
    return np.asarray([gallery_labels[i] for i in nearest])


def top1_accuracy(predicted_labels: np.ndarray, true_label: int) -> float:
    return float(np.mean(predicted_labels == true_label))
