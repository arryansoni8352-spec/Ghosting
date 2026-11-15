"""Glaze-inspired style-cloak optimisation (independent implementation, JAX).

See docs/STYLE_SHIELD_DESIGN.md for the specification and the list of substitutions from Glaze.
Everything is gradient-based. The only initialisation is w = 0 (no perturbation); no random noise
is added to any image at any stage.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from functools import partial

import jax
import jax.numpy as jnp
import numpy as np

from app.core.errors import JobCancelled
from app.engines.style_shield.mobilenet import features
from app.engines.style_shield.ssim import dssim_distance

CLOAK_LAYERS = ("conv_pw_3_relu", "conv_pw_5_relu", "conv_pw_7_relu")
CONTENT_LAYER = "conv_pw_5_relu"
STYLE_LAYERS = ("conv_pw_2_relu", "conv_pw_4_relu", "conv_pw_6_relu")
PROBE_LAYER = "conv_pw_7_relu"


@dataclass(frozen=True)
class Preset:
    name: str
    epsilon: float          # L-infinity budget on the [0,1] scale (e.g. 8/255)
    steps: int              # Adam steps for the cloak
    lr: float               # Adam learning rate on w
    alpha: float            # weight of the perceptual penalty
    p_s: float              # budget on D_s = (1 - SSIM) / 2


PRESETS = {
    "low": Preset("low", 4 / 255, 200, 0.01, 10.0, 0.02),
    "balanced": Preset("balanced", 8 / 255, 500, 0.01, 2.0, 0.05),
    "high": Preset("high", 16 / 255, 500, 0.02, 0.5, 0.10),
}


def to_array(arr_uint8: np.ndarray) -> jnp.ndarray:
    """HWC uint8 -> 1 x H x W x C float32 on [0,1]."""
    return jnp.asarray(arr_uint8, dtype=jnp.float32)[None] / 255.0


def pool_features(params, x01, layer: str = PROBE_LAYER) -> jnp.ndarray:
    """Global-average-pooled feature vector (1-D) of one layer."""
    f = features(params, x01, (layer,))[layer]
    return jnp.mean(f, axis=(1, 2))[0]


def band_choice(dists: dict, rng: np.random.Generator) -> tuple[str, dict]:
    """Glaze §5.3 step 1 (pure rule): keep candidates whose distance lies in the [p50, p75] band of
    all candidate distances, then choose one uniformly at random."""
    if not dists:
        raise ValueError("no candidate styles")
    values = np.array(list(dists.values()), dtype=np.float64)
    lo, hi = np.percentile(values, 50), np.percentile(values, 75)
    eligible = sorted(n for n, d in dists.items() if lo <= d <= hi)
    if not eligible:
        raise RuntimeError("no candidate fell in the percentile band")
    choice = eligible[int(rng.integers(len(eligible)))]
    return choice, {"distances": dict(dists), "p50": float(lo), "p75": float(hi), "eligible": eligible}


def select_target(params, victim_imgs, candidate_imgs: dict, rng: np.random.Generator) -> tuple[str, dict]:
    """Distances between the victim's pooled-feature centroid and each candidate's centroid."""
    victim_c = jnp.stack([pool_features(params, x) for x in victim_imgs]).mean(0)
    dists = {}
    for name, imgs in candidate_imgs.items():
        c = jnp.stack([pool_features(params, x) for x in imgs]).mean(0)
        dists[name] = float(jnp.linalg.norm(c - victim_c))
    return band_choice(dists, rng)


def _gram(f):
    _, h, w, c = f.shape
    flat = f.reshape(h * w, c)
    return flat.T @ flat / (c * h * w)


@partial(jax.jit, static_argnames=())
def _style_loss(y, params, fc, gs, content_w, style_w):
    out = features(params, y, (CONTENT_LAYER,) + STYLE_LAYERS)
    loss_c = content_w * jnp.mean((out[CONTENT_LAYER] - fc) ** 2)
    loss_s = style_w * sum(jnp.mean((_gram(out[k]) - gs[k]) ** 2) for k in STYLE_LAYERS)
    return loss_c + loss_s


_style_grad = jax.jit(jax.value_and_grad(_style_loss))


def _adam_update(p, g, m, v, t, lr, b1=0.9, b2=0.999, eps=1e-8):
    m = b1 * m + (1 - b1) * g
    v = b2 * v + (1 - b2) * g * g
    mhat = m / (1 - b1 ** t)
    vhat = v / (1 - b2 ** t)
    return p - lr * mhat / (jnp.sqrt(vhat) + eps), m, v


def style_transfer(params, content01, style01, steps: int = 200, lr: float = 0.02,
                   content_w: float = 1.0, style_w: float = 1e4, should_stop=None, progress=None):
    """Gatys-style transfer (Ω substitute). Returns a 1 x H x W x C array on [0,1].

    `should_stop()` is polled before every step; if it returns True, JobCancelled is raised.
    `progress(done, total)` is called after every step.
    """
    fc = features(params, content01, (CONTENT_LAYER,))[CONTENT_LAYER]
    fs = features(params, style01, STYLE_LAYERS)
    gs = {k: _gram(v) for k, v in fs.items()}
    y = content01
    m = jnp.zeros_like(y)
    v = jnp.zeros_like(y)
    for t in range(1, steps + 1):
        if should_stop is not None and should_stop():
            raise JobCancelled()
        _, g = _style_grad(y, params, fc, gs, content_w, style_w)
        y, m, v = _adam_update(y, g, m, v, t, lr)
        y = jnp.clip(y, 0.0, 1.0)
        if progress is not None:
            progress(t, steps)
    return y


@dataclass
class CloakResult:
    protected01: jnp.ndarray
    delta: jnp.ndarray
    history: list = field(default_factory=list)
    seconds: float = 0.0


def _cloak_loss(w, x01, ft, eps, alpha, p_s, params, mask):
    delta = mask * eps * jnp.tanh(w)   # w: 1xHxWxcw, broadcast over RGB when cw == 1
    xp = jnp.clip(x01 + delta, 0.0, 1.0)
    fx = features(params, xp, CLOAK_LAYERS)
    l_feat = sum(jnp.mean((fx[k] - ft[k]) ** 2) for k in CLOAK_LAYERS) / len(CLOAK_LAYERS)
    d_s = dssim_distance(x01, xp)
    penalty = alpha * jnp.maximum(d_s - p_s, 0.0)
    loss = l_feat + penalty
    return loss, {"l_feat": l_feat, "d_s": d_s, "penalty": penalty}


_cloak_grad = jax.jit(jax.value_and_grad(_cloak_loss, has_aux=True), static_argnames=())


def compute_cloak(params, x01, target01, preset: Preset, mask=None, channels: int = 3,
                  should_stop=None, progress=None) -> CloakResult:
    """Optimise a bounded cloak for one artwork (design §2.3, §3.1).

    L(w) = L_feat + alpha * max(D_s(x, x') - p_s, 0),  delta = mask * eps * tanh(w),  x' = clip(x + delta).

    mask:     1 x H x W x 1 array (1 where the pixel may change, 0 elsewhere). Default: all ones.
    channels: 3 for colour (independent per-channel change) or 1 for grayscale (one shared change).
    """
    if mask is None:
        mask = jnp.ones(x01.shape[:3] + (1,), dtype=x01.dtype)
    ft = {k: jax.lax.stop_gradient(v) for k, v in features(params, target01, CLOAK_LAYERS).items()}
    w = jnp.zeros(x01.shape[:3] + (channels,), dtype=x01.dtype)
    m = jnp.zeros_like(w)
    v = jnp.zeros_like(w)
    history = []
    t0 = time.perf_counter()
    for step in range(1, preset.steps + 1):
        if should_stop is not None and should_stop():
            raise JobCancelled()
        (loss, aux), g = _cloak_grad(w, x01, ft, preset.epsilon, preset.alpha, preset.p_s, params, mask)
        if step == 1 or step % 50 == 0 or step == preset.steps:
            history.append({"step": step, "loss": float(loss), "l_feat": float(aux["l_feat"]),
                            "d_s": float(aux["d_s"]), "penalty": float(aux["penalty"])})
        w, m, v = _adam_update(w, g, m, v, step, preset.lr)
        if progress is not None:
            progress(step, preset.steps)
    jax.block_until_ready(w)
    seconds = time.perf_counter() - t0
    delta = mask * preset.epsilon * jnp.tanh(w)
    xp = jnp.clip(x01 + delta, 0.0, 1.0)
    return CloakResult(protected01=xp, delta=delta, history=history, seconds=seconds)


def quantise(x01) -> np.ndarray:
    """1 x H x W x C array on [0,1] -> HWC uint8, round-to-nearest (no budget applied here)."""
    arr = np.rint(np.asarray(x01[0]) * 255.0)
    return np.clip(arr, 0, 255).astype(np.uint8)
