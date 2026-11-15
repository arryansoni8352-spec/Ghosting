"""Format validation, decompression-bomb and upload-size tests against the real API."""
import io

from PIL import Image

from tests.api.conftest import png_bytes


def test_signature_mismatch_is_rejected(client):
    """A file whose bytes do NOT match its declared signature is refused by content, not by label."""
    gif_bytes = b"GIF89a\x01\x00\x01\x00\x00\x00\x00;"
    files = {"file": ("x.png", gif_bytes, "image/png")}   # named .png, but it's a GIF
    r = client.post("/engines/style_shield/protect", files=files, data={"strength": "low"})
    assert r.status_code == 400
    assert r.json()["error"] == "unsupported_image"


def test_client_mime_type_is_ignored(client):
    """Real PNG bytes labelled as image/jpeg must still be processed as PNG."""
    files = {"file": ("x.jpg", png_bytes(), "image/jpeg")}
    r = client.post("/engines/style_shield/jobs", files=files,
                    data={"strength": "low", "max_steps": "2"})
    assert r.status_code == 202


def test_corrupt_bytes_rejected(client):
    files = {"file": ("x.png", b"not an image", "image/png")}
    r = client.post("/engines/style_shield/protect", files=files)
    assert r.status_code == 400


def test_truncated_image_rejected(client):
    full = png_bytes(size=64)
    truncated = full[: len(full) // 2]
    files = {"file": ("x.png", truncated, "image/png")}
    r = client.post("/engines/style_shield/protect", files=files, data={"strength": "low"})
    assert r.status_code == 400
    assert r.json()["error"] == "corrupt_image"


def test_dimension_limit_is_checked_before_pixel_decode(client):
    """A PNG declaring dimensions over the configured pixel limit is refused without allocating pixels."""
    # 2000x2000 flat image: small file, large declared dimensions (test env caps at 256*256 px)
    im = Image.new("RGB", (2000, 2000), (10, 20, 30))
    b = io.BytesIO(); im.save(b, "PNG")
    files = {"file": ("big.png", b.getvalue(), "image/png")}
    r = client.post("/engines/style_shield/protect", files=files)
    assert r.status_code == 413
    assert r.json()["error"] == "image_too_large"


def test_minimum_side_enforced(client):
    im = Image.new("RGB", (8, 8), (1, 2, 3))
    b = io.BytesIO(); im.save(b, "PNG")
    r = client.post("/engines/style_shield/protect", files={"file": ("tiny.png", b.getvalue(), "image/png")})
    assert r.status_code == 400


def test_animated_image_rejected(client):
    frames = [Image.new("RGB", (40, 40), c) for c in [(255, 0, 0), (0, 255, 0)]]
    b = io.BytesIO()
    frames[0].save(b, "PNG", save_all=True, append_images=frames[1:])
    r = client.post("/engines/style_shield/protect", files={"file": ("a.png", b.getvalue(), "image/png")})
    assert r.status_code == 400


def test_upload_over_size_limit_rejected_without_full_buffering(client):
    """SHIELD_MAX_UPLOAD_MB=1 in the test env. A 3 MB body must be refused, not buffered whole."""
    garbage = b"\x00" * (3 * 1024 * 1024)
    r = client.post("/engines/style_shield/protect",
                    files={"file": ("big.bin", garbage, "application/octet-stream")})
    assert r.status_code == 413


def test_unknown_engine_404(client):
    r = client.post("/engines/nonexistent/protect", files={"file": ("a.png", png_bytes(), "image/png")})
    assert r.status_code == 404


def test_face_shield_returns_501(client):
    r = client.post("/engines/face_shield/protect", files={"file": ("a.png", png_bytes(), "image/png")})
    assert r.status_code == 501
    assert r.json()["error"] == "engine_not_implemented"
