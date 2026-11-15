"""Controlled proxy experiment for Style Shield (docs/STYLE_SHIELD_DESIGN.md §2.4).

Question: when a proxy classifier is trained on cloaked images of a victim style, does its recognition
of the victim's CLEAN style change, compared with (C0) clean training and (C1) training on random noise
matched in SSIM to the cloaks?

Visual quality and adversarial effectiveness are written to separate sections of the output.

    python -m scripts.run_style_experiment --seeds 0 1 2 --size 128 --preset balanced
"""
from __future__ import annotations

import argparse
import json
import pathlib
import platform
import time
from datetime import datetime, timezone

import jax
import jax.numpy as jnp
import numpy as np

from app.engines.style_shield import optimise as opt
from app.engines.style_shield.mobilenet import load_mobilenet_v1
from app.engines.style_shield.weights import MOBILENET_V1_NOTOP, ensure_weights, sha256_of
from app.evaluation import art_generator
from app.evaluation import metrics as m
from app.evaluation.compare import compare_arrays

VICTIMS = list(art_generator.VICTIM_STYLES)     # A1..A4
PROTECTED = "A1"
N_TRAIN = 12
N_TEST = 12
EXEMPLAR_SEED = 1000
CONDITIONS = ("C0_clean", "C1_matched_noise", "C2_style_shield")


def clean_dataset(seed: int, size: int):
    tr_i, tr_y, te_i, te_y = [], [], [], []
    for idx, style in enumerate(VICTIMS):
        for i in range(N_TRAIN):
            tr_i.append(art_generator.paint(style, 100000 * seed + 100 * idx + i, size))
            tr_y.append(idx)
        for i in range(N_TEST):
            te_i.append(art_generator.paint(style, 100000 * seed + 100 * idx + 50 + i, size))
            te_y.append(idx)
    return tr_i, np.array(tr_y), te_i, np.array(te_y)


def matched_noise(x: np.ndarray, target_ssim: float, rng: np.random.Generator) -> np.ndarray:
    """Uniform noise whose SSIM to x is as close as possible to target_ssim (bisection on amplitude)."""
    lo, hi = 0.0, 128.0
    best = None
    for _ in range(14):
        a = (lo + hi) / 2
        y = np.clip(np.rint(x.astype(np.float64) + rng.uniform(-a, a, size=x.shape)), 0, 255).astype(np.uint8)
        s = m.ssim(x, y)
        if best is None or abs(s - target_ssim) < abs(best[1] - target_ssim):
            best = (y, s)
        if s > target_ssim:
            lo = a
        else:
            hi = a
    return best[0]


def probe_features(params, arrays) -> jnp.ndarray:
    vecs = [opt.pool_features(params, opt.to_array(a)) for a in arrays]
    v = jnp.stack(vecs)
    return v / jnp.linalg.norm(v, axis=1, keepdims=True)


def train_probe(x, y, n_classes: int, steps: int = 300, lr: float = 0.05, wd: float = 1e-4, seed: int = 0):
    """Multinomial logistic regression with Adam (full batch). Deterministic given the seed."""
    key = jax.random.PRNGKey(seed)
    w = 0.01 * jax.random.normal(key, (x.shape[1], n_classes))
    b = jnp.zeros((n_classes,))
    params = (w, b)

    def loss(p):
        w_, b_ = p
        logits = x @ w_ + b_
        ce = -jnp.mean(jax.nn.log_softmax(logits)[jnp.arange(y.shape[0]), y])
        return ce + wd * jnp.sum(w_ ** 2)

    grad = jax.jit(jax.grad(loss))
    m_ = jax.tree_util.tree_map(jnp.zeros_like, params)
    v_ = jax.tree_util.tree_map(jnp.zeros_like, params)
    for t in range(1, steps + 1):
        g = grad(params)
        m_ = jax.tree_util.tree_map(lambda a, b_: 0.9 * a + 0.1 * b_, m_, g)
        v_ = jax.tree_util.tree_map(lambda a, b_: 0.999 * a + 0.001 * b_ * b_, v_, g)
        params = jax.tree_util.tree_map(
            lambda p, mm, vv: p - lr * (mm / (1 - 0.9 ** t)) / (jnp.sqrt(vv / (1 - 0.999 ** t)) + 1e-8),
            params, m_, v_)
    return params


def predict(params_clf, x):
    w, b = params_clf
    return np.asarray(jnp.argmax(x @ w + b, axis=1))


def run_seed(seed: int, size: int, params, preset: opt.Preset, log, transfer_steps: int = 200) -> dict:
    t_seed = time.perf_counter()
    tr_i, tr_y, te_i, te_y = clean_dataset(seed, size)
    victim_idx = VICTIMS.index(PROTECTED)
    protected_idx = [i for i in range(len(tr_i)) if tr_y[i] == victim_idx]

    # ---- target selection (design §2.2): candidates have 4 generated images each;
    #      the victim centroid uses ONLY the victim's training images.
    cand = {name: [opt.to_array(art_generator.paint(name, EXEMPLAR_SEED + 1000 * j + seed, size))
                   for j in range(4)] for name in art_generator.CANDIDATE_STYLES}
    victim_train = [opt.to_array(tr_i[i]) for i in protected_idx]
    target_name, sel = opt.select_target(params, victim_train, cand, np.random.default_rng(seed))
    style = opt.to_array(art_generator.paint(target_name, EXEMPLAR_SEED + seed, size))
    log(f"  seed {seed}: target {target_name}, eligible {sel['eligible']}")

    # ---- protect each victim training image (gradient-based, design §2.3)
    cloaks, transfer_s, cloak_s = {}, 0.0, 0.0
    for i in protected_idx:
        x = opt.to_array(tr_i[i])
        t0 = time.perf_counter()
        tgt = opt.style_transfer(params, x, style, steps=transfer_steps)
        jax.block_until_ready(tgt)
        transfer_s += time.perf_counter() - t0
        res = opt.compute_cloak(params, x, tgt, preset)
        cloak_s += res.seconds
        cloaks[i] = opt.quantise(res.protected01)
    log(f"    cloaked {len(cloaks)} images: transfer {transfer_s:.0f}s, cloak {cloak_s:.0f}s")

    # ---- SSIM-matched random-noise control (same SSIM as each cloak)
    rng = np.random.default_rng(seed + 77)
    noises, cloak_ssim = {}, []
    for i, c in cloaks.items():
        s_c = m.ssim(tr_i[i], c)
        cloak_ssim.append(s_c)
        noises[i] = matched_noise(tr_i[i], s_c, rng)

    # ---- visual quality: Phase 2 harness, victim pairs only (NOT effectiveness)
    vis = {"cloak": [compare_arrays(tr_i[i], cloaks[i]).to_dict() for i in protected_idx],
           "noise_control": [compare_arrays(tr_i[i], noises[i]).to_dict() for i in protected_idx]}

    # ---- three training conditions and a clean test set
    def condition(replace):
        out = list(tr_i)
        for i, arr in (replace or {}).items():
            out[i] = arr
        return out

    conditions = {"C0_clean": condition(None),
                  "C1_matched_noise": condition(noises),
                  "C2_style_shield": condition(cloaks)}
    te_feats = probe_features(params, te_i)
    victim_mask = te_y == victim_idx
    effect = {}
    for name in CONDITIONS:
        xtr = probe_features(params, conditions[name])
        clf = train_probe(xtr, jnp.asarray(tr_y), len(VICTIMS), seed=seed)
        pred = predict(clf, te_feats)
        effect[name] = {
            "victim_recognition_rate": float(np.mean(pred[victim_mask] == victim_idx)),
            "victim_to_any_other_rate": float(np.mean(pred[victim_mask] != victim_idx)),
            "overall_test_accuracy": float(np.mean(pred == te_y)),
            "per_class_test_accuracy": {VICTIMS[k]: float(np.mean(pred[te_y == k] == k))
                                        for k in range(len(VICTIMS))},
        }

    # ---- feature shift (effectiveness-side measurement, reported separately)
    def shift(imgs):
        return [float(jnp.linalg.norm(opt.pool_features(params, opt.to_array(imgs[i]))
                                      - opt.pool_features(params, opt.to_array(tr_i[i]))))
                for i in protected_idx]

    return {
        "seed": seed,
        "target_style": target_name,
        "target_selection": {k: v for k, v in sel.items() if k != "distances"},
        "target_distances": sel["distances"],
        "visual_quality": vis,
        "effectiveness": effect,
        "feature_shift": {"C2_cloak_vs_original_mean_l2": float(np.mean(shift(cloaks))),
                          "C1_noise_vs_original_mean_l2": float(np.mean(shift(noises)))},
        "cloak_ssim_mean": float(np.mean(cloak_ssim)),
        "seconds": round(time.perf_counter() - t_seed, 1),
    }


def summarise(per_seed: list[dict]) -> dict:
    def stats(vals):
        vals = np.asarray(vals, dtype=float)
        return {"mean": float(vals.mean()), "min": float(vals.min()), "max": float(vals.max()),
                "n_seeds": int(vals.size)}
    out = {"effectiveness": {}, "visual_quality": {}, "feature_shift": {}}
    for cond in CONDITIONS:
        out["effectiveness"][cond] = {
            k: stats([s["effectiveness"][cond][k] for s in per_seed])
            for k in ("victim_recognition_rate", "victim_to_any_other_rate", "overall_test_accuracy")
        }
    for kind in ("cloak", "noise_control"):
        out["visual_quality"][kind] = {
            k: stats([np.mean([q[k] for q in s["visual_quality"][kind]]) for s in per_seed])
            for k in ("ssim", "mean_absolute_difference", "max_abs_difference")
        }
    for k in ("C2_cloak_vs_original_mean_l2", "C1_noise_vs_original_mean_l2"):
        out["feature_shift"][k] = stats([s["feature_shift"][k] for s in per_seed])
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2])
    ap.add_argument("--size", type=int, default=128)
    ap.add_argument("--preset", default="balanced", choices=list(opt.PRESETS))
    ap.add_argument("--out", default="docs/experiments/style_shield_results.json")
    ap.add_argument("--steps", type=int, default=None, help="PILOT ONLY: override cloak steps")
    ap.add_argument("--transfer-steps", type=int, default=200, help="PILOT ONLY if changed")
    args = ap.parse_args()

    def log(msg):
        print(msg, flush=True)

    preset = opt.PRESETS[args.preset]
    if args.steps is not None:
        preset = opt.Preset(**{**preset.__dict__, "steps": args.steps})
        log("WARNING: cloak steps overridden (pilot run, not the specified experiment)")
    weights = ensure_weights(MOBILENET_V1_NOTOP)
    params = load_mobilenet_v1(weights)
    t0 = time.perf_counter()
    per_seed = []
    for s in args.seeds:
        log(f"seed {s}")
        per_seed.append(run_seed(s, args.size, params, preset, log, transfer_steps=args.transfer_steps))
        pathlib.Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        with open(args.out + ".partial", "w") as f:       # progress checkpoint after each seed
            json.dump({"completed_seeds": [p["seed"] for p in per_seed]}, f)
    payload = {
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "description": ("Proxy experiment: a linear probe on frozen MobileNetV1 features, trained on clean, "
                        "SSIM-matched noise, or cloaked versions of victim A1. Not a generative fine-tuning "
                        "test. Not Glaze's evaluation."),
        "environment": {"python": platform.python_version(), "jax": jax.__version__,
                        "platform": jax.devices()[0].platform, "machine": platform.machine()},
        "model": {"name": MOBILENET_V1_NOTOP.name, "weights_sha256": sha256_of(weights),
                  "weights_licence": MOBILENET_V1_NOTOP.licence_weights},
        "settings": {"size": args.size, "preset": args.preset, "preset_params": preset.__dict__,
                     "transfer_steps": args.transfer_steps, "pilot_override": args.steps is not None,
                     "probe": {"type": "multinomial logistic regression on L2-normalised pooled conv_pw_7_relu",
                               "optimiser": "Adam lr 0.05, 300 full-batch steps, L2 1e-4, init seed = run seed"},
                     "n_train_per_class": N_TRAIN, "n_test_per_class": N_TEST,
                     "victims": VICTIMS, "protected": PROTECTED, "exemplar_seed": EXEMPLAR_SEED},
        "per_seed": per_seed,
        "summary": summarise(per_seed),
        "total_seconds": round(time.perf_counter() - t0, 1),
    }
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=2)
    log(f"wrote {args.out} in {payload['total_seconds']}s")


if __name__ == "__main__":
    main()
