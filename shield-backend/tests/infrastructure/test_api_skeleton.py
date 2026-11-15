"""INFRASTRUCTURE / API TEST. Checks the skeleton, schemas or device logic only.
It does NOT demonstrate adversarial protection."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    # Updated in Phase 2: device reporting now describes the JAX backend (no stale torch fields).
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    compute = body["compute"]
    assert compute["jax_installed"] is True
    assert compute["active_backend"] in {"cpu", "gpu", "cuda", "rocm", "tpu"}
    assert compute["cpu_available"] or compute["gpu_available"]


def test_models_lists_both_engines_with_implementation_status():
    # Updated in Phase 3: Style Shield is now implemented; Face Shield is still a stub.
    r = client.get("/models")
    assert r.status_code == 200
    engines = {e["engine"]: e for e in r.json()["engines"]}
    assert set(engines) == {"face_shield", "style_shield"}
    assert engines["face_shield"]["implemented"] is False
    assert engines["style_shield"]["implemented"] is True


def test_protect_returns_501_not_fake_output():
    files = {"file": ("x.png", b"\x89PNG\r\n\x1a\n", "image/png")}
    r = client.post("/engines/face_shield/protect", files=files, data={"strength": "low"})
    assert r.status_code == 501
    assert r.json()["error"] == "engine_not_implemented"


def test_unknown_engine_404():
    files = {"file": ("x.png", b"x", "image/png")}
    r = client.post("/engines/nope/protect", files=files)
    assert r.status_code == 404


def test_rejects_unsupported_type():
    # Phase 2: the decision is made from the file bytes. These are real GIF bytes.
    files = {"file": ("x.gif", b"GIF89a\x01\x00\x01\x00\x00\x00\x00;", "image/gif")}
    r = client.post("/engines/style_shield/protect", files=files)
    assert r.status_code == 400
    assert r.json()["error"] == "unsupported_image"
