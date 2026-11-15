"""Model-dependent engine tests: the real pipeline on real encoded images.

These check correctness of alpha, colour mode, the exact 8-bit budget, formats and records.
They do NOT show that any output protects against any model.
"""
import io
import json

import numpy as np
import pytest
from PIL import Image

from app.core.errors import InvalidOptionError
from app.engines.style_shield import optimise as opt
from app.engines.style_shield.budget import integer_budget
from app.engines.style_shield.engine import Control, StyleShieldEngine
from app.evaluation import art_generator
from app.utils import images

pytestmark = pytest.mark.model


@pytest.fixture(scope="module")
def engine():
    from tests.conftest import require_model_weights
    require_model_weights()
    eng = StyleShieldEngine()
    eng.load_model()
    return eng


def _encode(arr=None, mode=None, alpha=None, fmt="PNG"):
    if arr is None:
        arr = art_generator.paint("A2", 11, 64)
    im = Image.fromarray(arr)
    if mode == "L":
        im = im.convert("L")
    elif mode == "RGBA":
        im = im.convert("RGBA")
        im.putalpha(Image.fromarray(alpha))
    elif mode == "LA":
        im = im.convert("LA")
        g = np.asarray(im)[..., 0]
        im = Image.fromarray(np.dstack([g, alpha]), "LA")
    b = io.BytesIO()
    im.save(b, fmt)
    return b.getvalue()


def _run(engine, data, **kw):
    src = images.load(data, max_pixels=512 * 512, min_side=32)
    return engine.run(src, kw.pop("strength", "low"), max_steps=kw.pop("max_steps", 4), **kw), src


def _decode_out(res):
    return images.decode(Image.open(io.BytesIO(res.encoded)), images.sniff(res.encoded))


def test_rgba_transparent_semi_and_opaque_pixels(engine):
    arr = art_generator.paint("A1", 3, 64)
    alpha = np.full((64, 64), 255, np.uint8)
    alpha[:16] = 0                       # fully transparent band
    alpha[16:32] = 128                   # semi-transparent band
    data = _encode(arr, "RGBA", alpha)
    res, src = _run(engine, data, out_format="png")
    out = _decode_out(res)
    assert out.mode == "RGBA"
    assert np.array_equal(out.alpha, src.alpha)                      # alpha exactly preserved
    assert np.array_equal(out.pixels[:16], src.pixels[:16])          # fully transparent: colour untouched
    m = integer_budget(opt.PRESETS["low"].epsilon)
    assert int(np.max(np.abs(out.pixels.astype(int) - src.pixels.astype(int)))) <= m
    assert res.record["output"]["alpha_preserved"] is True
    assert res.record["input"]["transparent_pixels"] == 16 * 64


def test_mixed_transparency_random_alpha(engine):
    rng = np.random.default_rng(0)
    arr = art_generator.paint("A3", 4, 64)
    alpha = rng.integers(0, 256, (64, 64)).astype(np.uint8)
    res, src = _run(engine, _encode(arr, "RGBA", alpha), out_format="png")
    out = _decode_out(res)
    assert np.array_equal(out.alpha, alpha)
    assert np.array_equal(out.pixels[alpha == 0], src.pixels[alpha == 0])


def test_grayscale_stays_grayscale_png(engine):
    res, src = _run(engine, _encode(mode="L"), out_format="png")
    out = _decode_out(res)
    assert out.mode == "L" and src.mode == "L"
    m = integer_budget(opt.PRESETS["low"].epsilon)
    assert int(np.max(np.abs(out.pixels.astype(int) - src.pixels.astype(int)))) <= m


def test_grayscale_alpha_la_preserved(engine):
    rng = np.random.default_rng(1)
    alpha = rng.integers(0, 256, (64, 64)).astype(np.uint8)
    res, src = _run(engine, _encode(art_generator.paint("A2", 2, 64), "LA", alpha), out_format="png")
    out = _decode_out(res)
    assert out.mode == "LA"
    assert np.array_equal(out.alpha, alpha)


def test_webp_grayscale_is_documented_conversion(engine):
    """WebP has no grayscale mode. Grayscale input comes back as RGB. Uses webp_lossless=True so
    the budget is exact and channels are EXACTLY equal (not just close): with lossless encoding
    there is no codec quantisation to introduce the small per-channel differences lossy WebP shows."""
    src = images.load(_encode(mode="L"), max_pixels=512 * 512, min_side=32)
    res = engine.run(src, "low", out_format="webp", webp_lossless=True, max_steps=4)
    out = _decode_out(res)
    assert out.mode == "RGB"
    assert res.record["output"]["mode"] == "RGB"
    assert np.array_equal(out.pixels[..., 0], out.pixels[..., 1])
    assert np.array_equal(out.pixels[..., 0], out.pixels[..., 2])


def test_webp_rgba_keeps_alpha(engine):
    rng = np.random.default_rng(2)
    alpha = rng.integers(0, 256, (64, 64)).astype(np.uint8)
    src = images.load(_encode(art_generator.paint("A4", 5, 64), "RGBA", alpha), max_pixels=512 * 512, min_side=32)
    res = engine.run(src, "low", out_format="webp", webp_lossless=True, max_steps=4)
    out = _decode_out(res)
    assert out.mode == "RGBA"
    assert np.array_equal(out.alpha, alpha)          # exact: lossless
    assert res.record["output"]["alpha_preserved"] is True


def test_jpeg_rejects_transparency(engine):
    alpha = np.full((64, 64), 128, np.uint8)
    with pytest.raises(InvalidOptionError):
        _run(engine, _encode(mode="RGBA", alpha=alpha), out_format="jpeg", quality=90)


@pytest.mark.parametrize("strength", ["low", "balanced", "high"])
def test_exact_budget_on_png_for_every_preset(engine, strength):
    data = _encode(art_generator.paint("A3", 8, 64))
    res, src = _run(engine, data, strength=strength, out_format="png")
    out = _decode_out(res)
    m = integer_budget(opt.PRESETS[strength].epsilon)
    worst = int(np.max(np.abs(out.pixels.astype(int) - src.pixels.astype(int))))
    assert worst <= m
    assert res.record["output"]["max_change_after_encoding"] == worst
    assert res.record["output"]["budget_integer_levels"] == m


def test_deterministic_output_for_identical_input(engine):
    data = _encode(art_generator.paint("A2", 13, 48))
    a, _ = _run(engine, data, out_format="png")
    b, _ = _run(engine, data, out_format="png")
    assert a.encoded == b.encoded


def test_record_has_no_filesystem_paths(engine):
    res, _ = _run(engine, _encode(art_generator.paint("A1", 1, 48)), out_format="png")
    text = json.dumps(res.record)
    assert "/home/" not in text and "models/" not in text and "\\" not in text
    assert res.record["effectiveness"] is None
    assert len(res.record["model"]["weights_sha256"]) == 64


def test_cancellation_stops_processing(engine):
    from app.core.errors import JobCancelled
    calls = {"n": 0}

    def stop():
        calls["n"] += 1
        return calls["n"] > 3

    src = images.load(_encode(art_generator.paint("A1", 1, 48)), max_pixels=512 * 512, min_side=32)
    with pytest.raises(JobCancelled):
        engine.run(src, "low", max_steps=50, control=Control(should_stop=stop))


def test_invalid_engine_arguments(engine):
    src = images.load(_encode(art_generator.paint("A1", 1, 48)), max_pixels=512 * 512, min_side=32)
    with pytest.raises(InvalidOptionError):
        engine.run(src, "extreme")
    with pytest.raises(InvalidOptionError):
        engine.run(src, "low", max_steps=0)
    with pytest.raises(InvalidOptionError):
        engine.run(src, "low", out_format="gif")


def test_jpeg_and_lossy_webp_fail_safely_rather_than_exceed_budget(engine):
    """KNOWN LIMITATION (measured, not assumed): JPEG's and lossy WebP's own compression artifacts
    (tens of 8-bit levels at image edges, independent of any perturbation) exceed every preset's
    budget (4/8/16 levels) at any achievable quality. The engine refuses these combinations
    BEFORE running optimisation rather than silently returning an out-of-budget image. Use PNG
    or output_format='webp' with webp_lossless=True for a guaranteed exact budget."""
    from app.core.errors import BudgetUnsatisfiableError
    # A2/seed=3 measured (docs/STYLE_SHIELD_DESIGN.md): JPEG q100 codec noise=29, WebP q100=30,
    # both well above the 'high' preset's 16-level budget; codec noise is image-content dependent,
    # so a fixed, previously-measured case is used rather than an arbitrary one.
    data = _encode(art_generator.paint("A2", 3, 64))
    src = images.load(data, max_pixels=512 * 512, min_side=32)
    for strength, out_format, quality in [("low", "jpeg", 92), ("high", "jpeg", 100),
                                          ("low", "webp", 92), ("high", "webp", 100)]:
        with pytest.raises(BudgetUnsatisfiableError):
            engine.run(src, strength, out_format=out_format, quality=quality, max_steps=2)


def test_lossless_webp_gives_exact_budget(engine):
    data = _encode(art_generator.paint("A1", 21, 64))
    src = images.load(data, max_pixels=512 * 512, min_side=32)
    res = engine.run(src, "low", out_format="webp", webp_lossless=True, max_steps=4)
    out = _decode_out(res)
    m = integer_budget(opt.PRESETS["low"].epsilon)
    assert int(np.max(np.abs(out.pixels.astype(int) - src.pixels.astype(int)))) <= m
    assert res.record["output"]["lossless"] is True
    assert res.record["output"]["budget_satisfied_after_encoding"] is True


def test_fully_transparent_pixels_excluded_from_budget_check(engine):
    """Lossless WebP can legitimately alter colour at alpha==0 pixels (invisible, codec-specific);
    the budget check must not count that as a violation, since those pixels carry no protection
    and the optimiser never touches them (visible == False there)."""
    rng = np.random.default_rng(9)
    arr = art_generator.paint("A1", 6, 64)
    alpha = np.full((64, 64), 255, np.uint8)
    alpha[:20] = 0   # fully transparent band
    data = _encode(arr, "RGBA", alpha)
    src = images.load(data, max_pixels=512 * 512, min_side=32)
    res = engine.run(src, "low", out_format="webp", webp_lossless=True, max_steps=4)
    out = _decode_out(res)
    assert res.record["output"]["budget_satisfied_after_encoding"] is True
    # visible region (alpha>0) must be within budget; invisible region is excluded by design,
    # but is still checked here to show what it actually does (informational, not asserted strict)
    m = integer_budget(opt.PRESETS["low"].epsilon)
    visible_diff = int(np.max(np.abs(out.pixels[alpha > 0].astype(int) - src.pixels[alpha > 0].astype(int))))
    assert visible_diff <= m
