"""Phase 3: independent evaluation framework for Style Shield.

Addresses the explicit gap in the first experiment (docs/STYLE_SHIELD_TECHNICAL_REPORT.md): that
experiment evaluated protection using the SAME model (MobileNetV1) the cloak was optimised
against, and its hard-classification metric was saturated (100% baseline), so it could not show
an effect either way.

This script:
- Keeps MobileNetV1 as the GENERATION model (the cloak is still optimised against it; unchanged).
- Adds SqueezeNet v1.1 as an INDEPENDENT evaluator: a different architecture (Fire modules vs
  depthwise-separable + BatchNorm), a different training lineage (original Caffe weights, BSD-2-
  Clause, confirmed licence), never used by the optimiser. Effectiveness measured on SqueezeNet
  is a genuine cross-model transfer test, not white-box.
- Reports THREE kinds of effectiveness metric (classification accuracy, embedding similarity,
  nearest-neighbour retrieval), not just the single saturated metric from before.
- Reports results under robustness transforms (resize round-trip, JPEG recompression) applied to
  the protected images, in addition to the untransformed result.
- Covers all three presets (low/balanced/high) as the baseline comparison the brief asks for
  ("existing" vs "improved" Style Shield output; this project has one implementation, so preset
  strength is the natural axis of comparison, explained in the report).
- Keeps visual quality (Phase 2 harness) and effectiveness as separate, clearly labelled outputs.
- Uses 2 seeds (reduced from the first experiment's 3, to keep total runtime tractable now that
  3 presets x 2 evaluators are run); confidence intervals are correspondingly wide and reported
  as mean/min/max, not treated as tight statistics.

No data leakage: the probe trains only on {clean, noise, cloak} TRAIN images; it is evaluated
only on held-out clean TEST images. The retrieval GALLERY is the clean TEST set (disjoint from
TRAIN); the retrieval QUERY is the (possibly transformed) PROTECTED TRAIN images - never a TEST
image, so gallery and query never share an image.
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
from app.engines.style_shield.squeezenet import load_squeezenet
from app.engines.style_shield import mobilenet as mobilenet_mod
from app.engines.style_shield import squeezenet as squeezenet_mod
from app.engines.style_shield.weights import (
    MOBILENET_V1_NOTOP, SQUEEZENET_V1_1_NOTOP, ensure_weights, sha256_of,
)
from app.evaluation import art_generator
from app.evaluation import metrics as m
from app.evaluation import robustness
from app.evaluation.compare import compare_arrays
from app.evaluation.embeddings import (
    Extractor, embed_many, nearest_neighbour_retrieval, pooled_embedding, top1_accuracy,
)

VICTIMS = list(art_generator.VICTIM_STYLES)
PROTECTED = "A1"
N_TRAIN = 12
N_TEST = 12
EXEMPLAR_SEED = 1000
CONDITIONS = ("C0_clean", "C1_matched_noise", "C2_low", "C2_balanced", "C2_high")
PRESET_FOR_CONDITION = {"C2_low": "low", "C2_balanced": "balanced", "C2_high": "high"}


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


def mobilenet_to_array(arr_uint8: np.ndarray) -> jnp.ndarray:
    return opt.to_array(arr_uint8)


def squeezenet_to_array(arr_uint8: np.ndarray) -> jnp.ndarray:
    return jnp.asarray(arr_uint8, dtype=jnp.float32)[None] / 255.0


def probe_features(ext: Extractor, arrays: list[np.ndarray]) -> jnp.ndarray:
    return jnp.asarray(embed_many(ext, arrays))


def train_probe(x, y, n_classes: int, steps: int = 300, lr: float = 0.05, wd: float = 1e-4, seed: int = 0):
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
    mm = jax.tree_util.tree_map(jnp.zeros_like, params)
    vv = jax.tree_util.tree_map(jnp.zeros_like, params)
    for t in range(1, steps + 1):
        g = grad(params)
        mm = jax.tree_util.tree_map(lambda a, b_: 0.9 * a + 0.1 * b_, mm, g)
        vv = jax.tree_util.tree_map(lambda a, b_: 0.999 * a + 0.001 * b_ * b_, vv, g)
        params = jax.tree_util.tree_map(
            lambda p, m_, v_: p - lr * (m_ / (1 - 0.9 ** t)) / (jnp.sqrt(v_ / (1 - 0.999 ** t)) + 1e-8),
            params, mm, vv)
    return params


def predict(params_clf, x):
    w, b = params_clf
    return np.asarray(jnp.argmax(x @ w + b, axis=1))


def evaluate_on_extractor(ext: Extractor, tr_i, tr_y, te_i, te_y, protected_idx, victim_idx,
                          condition_imgs: dict[str, list], query_transform_name: str, seed: int) -> dict:
    """Classification accuracy (probe), embedding similarity, and NN retrieval for one extractor,
    one robustness transform, across all conditions."""
    transform = robustness.TRANSFORMS[query_transform_name]
    te_feats = probe_features(ext, te_i)
    gallery_embs = np.asarray(te_feats)          # gallery = clean TEST set
    gallery_labels = list(te_y)

    out = {"classification": {}, "embedding_similarity": {}, "retrieval_top1": {}}
    for cond in CONDITIONS:
        imgs = condition_imgs[cond]
        xtr = probe_features(ext, imgs)
        clf = train_probe(xtr, jnp.asarray(tr_y), len(VICTIMS), seed=seed)
        pred = predict(clf, te_feats)
        victim_mask = te_y == victim_idx
        out["classification"][cond] = {
            "victim_recognition_rate": float(np.mean(pred[victim_mask] == victim_idx)),
            "overall_test_accuracy": float(np.mean(pred == te_y)),
        }

        # Embedding similarity and retrieval: query = this condition's VICTIM images only,
        # after the robustness transform; original = the matching CLEAN (untransformed) image.
        victim_cond_imgs = [imgs[i] for i in protected_idx]
        victim_orig_imgs = [tr_i[i] for i in protected_idx]
        query_imgs = [transform(im) for im in victim_cond_imgs]
        q_embs = embed_many(ext, query_imgs)
        o_embs = embed_many(ext, victim_orig_imgs)
        sim_to_original = float(np.mean(np.sum(q_embs * o_embs, axis=1)))  # both L2-normalised
        out["embedding_similarity"][cond] = {"mean_cosine_sim_to_own_original": sim_to_original}

        preds = nearest_neighbour_retrieval(q_embs, gallery_embs, gallery_labels)
        out["retrieval_top1"][cond] = {"victim_retrieved_rate": top1_accuracy(preds, victim_idx)}
    return out


def run_seed(seed: int, size: int, mn_params, sq_params, log) -> dict:
    t_seed = time.perf_counter()
    tr_i, tr_y, te_i, te_y = clean_dataset(seed, size)
    victim_idx = VICTIMS.index(PROTECTED)
    protected_idx = [i for i in range(len(tr_i)) if tr_y[i] == victim_idx]

    cand = {name: [opt.to_array(art_generator.paint(name, EXEMPLAR_SEED + 1000 * j + seed, size))
                   for j in range(4)] for name in art_generator.CANDIDATE_STYLES}
    victim_train = [opt.to_array(tr_i[i]) for i in protected_idx]
    target_name, sel = opt.select_target(mn_params, victim_train, cand, np.random.default_rng(seed))
    style = opt.to_array(art_generator.paint(target_name, EXEMPLAR_SEED + seed, size))
    log(f"  seed {seed}: target {target_name}, eligible {sel['eligible']}")

    condition_imgs = {"C0_clean": list(tr_i)}
    visual_quality = {}
    cloak_ssims = {}
    t_gen0 = time.perf_counter()
    for preset_key, preset_name in PRESET_FOR_CONDITION.items():
        preset = opt.PRESETS[preset_name]
        cloaks = {}
        for i in protected_idx:
            x = opt.to_array(tr_i[i])
            tgt = opt.style_transfer(mn_params, x, style)
            jax.block_until_ready(tgt)
            res = opt.compute_cloak(mn_params, x, tgt, preset)
            cloaks[i] = opt.quantise(res.protected01)
        imgs = list(tr_i)
        for i, arr in cloaks.items():
            imgs[i] = arr
        condition_imgs[preset_key] = imgs
        visual_quality[preset_key] = [compare_arrays(tr_i[i], cloaks[i]).to_dict() for i in protected_idx]
        cloak_ssims[preset_key] = [m.ssim(tr_i[i], cloaks[i]) for i in protected_idx]
        log(f"    {preset_key}: cloaked {len(cloaks)} images")
    gen_seconds = time.perf_counter() - t_gen0

    # Noise control matched to the BALANCED preset's SSIM (the "default" strength)
    rng = np.random.default_rng(seed + 77)
    noises = {}
    for i in protected_idx:
        s_c = float(np.mean(cloak_ssims["C2_balanced"]))
        noises[i] = matched_noise(tr_i[i], s_c, rng)
    imgs = list(tr_i)
    for i, arr in noises.items():
        imgs[i] = arr
    condition_imgs["C1_matched_noise"] = imgs
    visual_quality["C1_matched_noise"] = [compare_arrays(tr_i[i], noises[i]).to_dict() for i in protected_idx]

    mn_ext = Extractor("mobilenet_v1", mn_params, mobilenet_mod.features, opt.PROBE_LAYER,
                       mobilenet_to_array, role="generation")
    sq_ext = Extractor("squeezenet_v1.1", sq_params, squeezenet_mod.features, "fire9",
                       squeezenet_to_array, role="independent")

    results = {"generation_model_proxy": {}, "independent_model": {}}
    for transform_name in robustness.TRANSFORMS:
        results["generation_model_proxy"][transform_name] = evaluate_on_extractor(
            mn_ext, tr_i, tr_y, te_i, te_y, protected_idx, victim_idx, condition_imgs, transform_name, seed)
        results["independent_model"][transform_name] = evaluate_on_extractor(
            sq_ext, tr_i, tr_y, te_i, te_y, protected_idx, victim_idx, condition_imgs, transform_name, seed)

    return {
        "seed": seed,
        "target_style": target_name,
        "target_selection": {k: v for k, v in sel.items() if k != "distances"},
        "visual_quality": visual_quality,
        "effectiveness": results,
        "generation_seconds": round(gen_seconds, 1),
        "seconds": round(time.perf_counter() - t_seed, 1),
    }


def summarise(per_seed: list[dict]) -> dict:
    def stats(vals):
        vals = np.asarray(vals, dtype=float)
        return {"mean": float(vals.mean()), "min": float(vals.min()), "max": float(vals.max()), "n_seeds": int(vals.size)}

    out = {"generation_model_proxy": {}, "independent_model": {}}
    for model_key in out:
        out[model_key] = {}
        for transform_name in robustness.TRANSFORMS:
            out[model_key][transform_name] = {"classification": {}, "embedding_similarity": {}, "retrieval_top1": {}}
            for cond in CONDITIONS:
                for metric_group, metric_names in (
                    ("classification", ("victim_recognition_rate", "overall_test_accuracy")),
                    ("embedding_similarity", ("mean_cosine_sim_to_own_original",)),
                    ("retrieval_top1", ("victim_retrieved_rate",)),
                ):
                    out[model_key][transform_name][metric_group][cond] = {
                        k: stats([s["effectiveness"][model_key][transform_name][metric_group][cond][k]
                                  for s in per_seed])
                        for k in metric_names
                    }
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, nargs="+", default=[0, 1])
    ap.add_argument("--size", type=int, default=128)
    ap.add_argument("--out", default="docs/experiments/independent_evaluation_results.json")
    ap.add_argument("--pilot-steps", type=int, default=None,
                    help="PILOT ONLY: override every preset's cloak step count")
    args = ap.parse_args()

    def log(msg):
        print(msg, flush=True)

    if args.pilot_steps is not None:
        log(f"WARNING: pilot mode, steps overridden to {args.pilot_steps} for every preset")
        for name in list(opt.PRESETS):
            opt.PRESETS[name] = opt.Preset(**{**opt.PRESETS[name].__dict__, "steps": args.pilot_steps})

    mn_weights = ensure_weights(MOBILENET_V1_NOTOP)
    sq_weights = ensure_weights(SQUEEZENET_V1_1_NOTOP)
    mn_params = load_mobilenet_v1(mn_weights)
    sq_params = load_squeezenet(sq_weights)

    t0 = time.perf_counter()
    per_seed = []
    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    for s in args.seeds:
        log(f"seed {s}")
        per_seed.append(run_seed(s, args.size, mn_params, sq_params, log))
        (out_path.parent / (out_path.name + ".partial")).write_text(
            json.dumps({"completed_seeds": [p["seed"] for p in per_seed]}))

    payload = {
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "description": ("Independent cross-model evaluation. Generation model: MobileNetV1 "
                        "(the cloak's own optimiser, white-box). Independent model: SqueezeNet "
                        "v1.1 (different architecture and training lineage, never seen by the "
                        "optimiser). Three effectiveness metrics per model: classification "
                        "accuracy, embedding similarity, nearest-neighbour retrieval. Evaluated "
                        "with and without two robustness transforms."),
        "environment": {"python": platform.python_version(), "jax": jax.__version__,
                        "platform": jax.devices()[0].platform},
        "models": {
            "generation": {"name": MOBILENET_V1_NOTOP.name, "weights_sha256": sha256_of(mn_weights),
                          "licence": MOBILENET_V1_NOTOP.licence_weights},
            "independent": {"name": SQUEEZENET_V1_1_NOTOP.name, "weights_sha256": sha256_of(sq_weights),
                            "licence": SQUEEZENET_V1_1_NOTOP.licence_weights},
        },
        "settings": {"size": args.size, "n_train_per_class": N_TRAIN, "n_test_per_class": N_TEST,
                     "victims": VICTIMS, "protected": PROTECTED, "conditions": list(CONDITIONS),
                     "pilot_steps_override": args.pilot_steps},
        "no_leakage_design": ("Probe trains on {clean,noise,cloak} TRAIN images only, tests on "
                              "held-out clean TEST images. Retrieval gallery = clean TEST set "
                              "(disjoint from TRAIN); retrieval query = (transformed) PROTECTED "
                              "TRAIN images. Gallery and query never share an image."),
        "per_seed": per_seed,
        "summary": summarise(per_seed),
        "total_seconds": round(time.perf_counter() - t0, 1),
    }
    out_path.write_text(json.dumps(payload, indent=2))
    log(f"wrote {out_path} in {payload['total_seconds']}s")


if __name__ == "__main__":
    main()
