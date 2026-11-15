"""Round-trip and quality behaviour across PNG, JPEG and WebP."""
import numpy as np
import pytest

from app.evaluation import metrics
from app.evaluation.compare import compare_bytes, compare_arrays
from app.utils import images
from app.evaluation import synthetic

FORMATS = ["png", "jpeg", "webp"]


def _skip_if_unsupported(fmt):
    if fmt == "webp" and not images.webp_supported():
        pytest.skip("this Pillow build has no WebP support")


@pytest.mark.parametrize("fmt", FORMATS)
def test_encode_decode_roundtrip_dimensions(fmt):
    _skip_if_unsupported(fmt)
    arr = synthetic.make("photo_like", 80, 60)
    data = images.encode_legacy(arr, fmt, quality=90)
    assert images.dimensions(data) == (80, 60)
    decoded = images.decode_rgb(data)
    assert decoded.shape == (60, 80, 3)
    assert decoded.dtype == np.uint8


def test_png_is_lossless():
    arr = synthetic.make("shapes", 90, 70)
    data = images.encode_legacy(arr, "png")
    assert np.array_equal(images.decode_rgb(data), arr)
    report = compare_bytes(data, data)
    assert report.psnr_db is None and report.ssim == 1.0 and report.mean_absolute_difference == 0


@pytest.mark.parametrize("fmt", ["jpeg", "webp"])
def test_lossy_quality_reduces_fidelity_and_size(fmt):
    _skip_if_unsupported(fmt)
    arr = synthetic.make("photo_like", 128, 96, seed=11)
    high = images.encode_legacy(arr, fmt, quality=95)
    low = images.encode_legacy(arr, fmt, quality=30)
    r_high = compare_arrays(arr, images.decode_rgb(high), len(high), len(high))
    r_low = compare_arrays(arr, images.decode_rgb(low), len(low), len(low))
    assert r_high.psnr_db > r_low.psnr_db
    assert r_high.ssim > r_low.ssim
    assert len(low) < len(high)


@pytest.mark.parametrize("fmt", ["jpeg", "webp"])
def test_lossy_encoding_is_deterministic(fmt):
    _skip_if_unsupported(fmt)
    arr = synthetic.make("texture", 64, 64, seed=2)
    assert images.encode_legacy(arr, fmt, quality=70) == images.encode_legacy(arr, fmt, quality=70)


def test_lossy_formats_require_quality():
    with pytest.raises(ValueError):
        images.encode_legacy(synthetic.make("gradient"), "jpeg")


def test_unsupported_format_rejected():
    with pytest.raises(ValueError):
        images.encode_legacy(synthetic.make("gradient"), "gif", quality=50)


def test_compare_bytes_refuses_dimension_mismatch():
    a = images.encode_legacy(synthetic.make("gradient", 64, 48), "png")
    b = images.encode_legacy(synthetic.make("gradient", 48, 64), "png")
    with pytest.raises(ValueError, match="dimension mismatch"):
        compare_bytes(a, b)


def test_alpha_is_composited_on_white():
    from PIL import Image
    import io
    rgba = Image.new("RGBA", (16, 16), (0, 0, 0, 0))   # fully transparent black
    buf = io.BytesIO()
    rgba.save(buf, format="PNG")
    decoded = images.decode_rgb(buf.getvalue())
    assert (decoded == 255).all()
