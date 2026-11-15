"""Properties of the gradient-based cloak optimisation.

These tests check the MECHANISM (gradient-driven, bounded, no noise, loss decreases). They do not show
that any cloak protects against any model; that is what the controlled experiment is for.
"""
import pathlib

import numpy as np
import pytest

pytestmark = pytest.mark.model

from app.engines.style_shield import optimise as opt
from app.engines.style_shield.weights import MOBILENET_V1_NOTOP, ensure_weights
from app.evaluation import art_generator


@pytest.fixture(scope="module")
def params():
    from tests.conftest import require_model_weights
    path = require_model_weights()
    from app.engines.style_shield.mobilenet import load_mobilenet_v1
    return load_mobilenet_v1(path)


@pytest.fixture(scope="module")
def pair(params):
    x = opt.to_array(art_generator.paint("A1", 5, 48))
    style = opt.to_array(art_generator.paint("T2", 1000, 48))
    target = opt.style_transfer(params, x, style, steps=10)
    return x, target


def test_zero_steps_gives_no_perturbation(params, pair):
    x, target = pair
    p = opt.Preset("zero", 8 / 255, 0, 0.01, 2.0, 0.05)
    r = opt.compute_cloak(params, x, target, p)
    assert float(np.max(np.abs(np.asarray(r.delta)))) == 0.0
    assert np.array_equal(opt.quantise(r.protected01), opt.quantise(x))


def test_budget_is_enforced_by_construction(params, pair):
    x, target = pair
    p = opt.Preset("probe", 4 / 255, 40, 0.05, 2.0, 0.05)  # aggressive lr to stress the bound
    r = opt.compute_cloak(params, x, target, p)
    assert float(np.max(np.abs(np.asarray(r.delta)))) <= p.epsilon + 1e-7


def test_quantised_output_within_strict_integer_budget(params, pair):
    """Phase 2: the budget is the integer m = floor(eps*255), with NO extra tolerance."""
    from app.engines.style_shield.budget import apply_integer_budget, integer_budget
    x, target = pair
    p = opt.PRESETS["low"]
    r = opt.compute_cloak(params, x, target, p)
    m = integer_budget(p.epsilon)
    orig = opt.quantise(x)
    delta = np.asarray(r.delta[0], dtype=np.float64)
    out = apply_integer_budget(orig, delta, m)
    assert int(np.max(np.abs(out.astype(int) - orig.astype(int)))) <= m


def test_loss_decreases_under_gradient_optimisation(params, pair):
    x, target = pair
    p = opt.Preset("trend", 8 / 255, 60, 0.02, 2.0, 0.05)
    r = opt.compute_cloak(params, x, target, p)
    assert r.history[-1]["loss"] < r.history[0]["loss"]
    assert r.history[-1]["l_feat"] < r.history[0]["l_feat"]


def test_cloak_is_not_random_noise(params, pair):
    """A gradient-driven cloak must move toward the target's features more than random noise of similar size."""
    x, target = pair
    p = opt.Preset("trend", 8 / 255, 60, 0.02, 2.0, 0.05)
    r = opt.compute_cloak(params, x, target, p)
    rng = np.random.default_rng(0)
    noise = np.clip(np.asarray(x) + rng.uniform(-p.epsilon, p.epsilon, np.asarray(x).shape), 0, 1)
    f_t = opt.pool_features(params, target)
    d_cloak = float(np.linalg.norm(np.asarray(opt.pool_features(params, r.protected01)) - np.asarray(f_t)))
    d_noise = float(np.linalg.norm(np.asarray(opt.pool_features(params, noise.astype(np.float32))) - np.asarray(f_t)))
    assert d_cloak < d_noise


def test_original_array_not_mutated(params, pair):
    x, target = pair
    before = np.asarray(x).copy()
    opt.compute_cloak(params, x, target, opt.Preset("m", 4 / 255, 5, 0.01, 2.0, 0.05))
    assert np.array_equal(np.asarray(x), before)


def test_presets_differ_in_real_parameters():
    p = opt.PRESETS
    assert p["low"].epsilon < p["balanced"].epsilon < p["high"].epsilon
    assert p["low"].steps < p["balanced"].steps
    assert p["low"].alpha > p["high"].alpha
    assert p["low"].p_s < p["high"].p_s


def test_deterministic_for_identical_inputs(params, pair):
    x, target = pair
    p = opt.Preset("det", 4 / 255, 10, 0.01, 2.0, 0.05)
    a = opt.quantise(opt.compute_cloak(params, x, target, p).protected01)
    b = opt.quantise(opt.compute_cloak(params, x, target, p).protected01)
    assert np.array_equal(a, b)
