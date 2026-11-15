"""Style Shield component tests that do NOT need model weights (offline group)."""
import hashlib
import numpy as np
import pytest

from app.evaluation import art_generator
from app.engines.style_shield.weights import MOBILENET_V1_NOTOP, WeightSpec, WeightIntegrityError, ensure_weights
from app.engines.style_shield import optimise


def test_art_generator_is_deterministic():
    a = art_generator.paint("A1", seed=7, size=64)
    b = art_generator.paint("A1", seed=7, size=64)
    assert np.array_equal(a, b)
    assert a.shape == (64, 64, 3) and a.dtype == np.uint8


def test_art_generator_seed_changes_image():
    assert not np.array_equal(art_generator.paint("A2", 1, 64), art_generator.paint("A2", 2, 64))


def test_victim_styles_are_visually_distinct():
    imgs = {k: art_generator.paint(k, 0, 64).astype(float).mean(axis=(0, 1)) for k in art_generator.VICTIM_STYLES}
    means = np.array(list(imgs.values()))
    dists = [np.linalg.norm(means[i] - means[j]) for i in range(4) for j in range(i + 1, 4)]
    assert min(dists) > 3.0


def test_unknown_style_rejected():
    with pytest.raises(ValueError):
        art_generator.paint("Z9", 0)


def test_band_choice_stays_inside_percentile_band():
    dists = {f"T{i}": float(i) for i in range(1, 13)}
    for seed in range(20):
        choice, info = optimise.band_choice(dists, np.random.default_rng(seed))
        assert info["p50"] <= dists[choice] <= info["p75"]
        assert choice in info["eligible"]


def test_band_choice_is_deterministic_for_seed():
    dists = {f"T{i}": float(i) for i in range(1, 13)}
    a = optimise.band_choice(dists, np.random.default_rng(3))[0]
    b = optimise.band_choice(dists, np.random.default_rng(3))[0]
    assert a == b


def test_band_choice_rejects_empty():
    with pytest.raises(ValueError):
        optimise.band_choice({}, np.random.default_rng(0))


def test_presets_differ_in_real_optimisation_parameters():
    p = optimise.PRESETS
    assert p["low"].epsilon < p["balanced"].epsilon < p["high"].epsilon
    assert p["low"].steps < p["balanced"].steps
    assert p["low"].alpha > p["high"].alpha          # stronger perceptual penalty when similarity matters
    assert p["low"].p_s < p["high"].p_s
    for preset in p.values():
        assert 0 < preset.epsilon <= 1 and preset.lr > 0 and preset.steps > 0


def test_weight_spec_checksum_mismatch_is_refused(tmp_path):
    src = tmp_path / "src.bin"
    src.write_bytes(b"not the real weights")
    bad = WeightSpec(name="x", url="http://invalid", filename="src.bin", sha256="0" * 64,
                     size_bytes=1, architecture="", source_repo="", licence_code="", licence_weights="")
    with pytest.raises(WeightIntegrityError, match="checksum"):
        ensure_weights(bad, models_dir=tmp_path, allow_download=False)


def test_weight_spec_registered_checksum_is_well_formed():
    assert len(MOBILENET_V1_NOTOP.sha256) == 64
    int(MOBILENET_V1_NOTOP.sha256, 16)
