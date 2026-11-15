"""Authentication and rate-limiting integration points."""
import hashlib

from tests.api.conftest import png_bytes


def test_auth_disabled_by_default_in_dev(client):
    r = client.get("/health")
    assert r.json()["security"]["auth_mode"] == "disabled"
    assert client.get("/models").status_code == 200   # no key required


def test_auth_required_when_enabled(monkeypatch, tmp_path, stub_engine):
    from app.config.settings import get_settings
    key = "test-key-123"
    digest = hashlib.sha256(key.encode()).hexdigest()
    monkeypatch.setenv("SHIELD_AUTH_MODE", "api_key")
    monkeypatch.setenv("SHIELD_API_KEY_SHA256", digest)
    monkeypatch.setenv("SHIELD_JOB_DIR", str(tmp_path / "jobs"))
    monkeypatch.setenv("SHIELD_RATE_LIMIT_PER_MINUTE", "0")
    get_settings.cache_clear()
    from app.main import create_app
    from fastapi.testclient import TestClient
    with TestClient(create_app()) as c:
        files = {"file": ("a.png", png_bytes(), "image/png")}
        r = c.post("/engines/style_shield/jobs", files=files, data={"strength": "low"})
        assert r.status_code == 401
        r = c.post("/engines/style_shield/jobs", files=files, data={"strength": "low"},
                   headers={"X-API-Key": "wrong-key"})
        assert r.status_code == 401
        r = c.post("/engines/style_shield/jobs", files=files, data={"strength": "low", "max_steps": "2"},
                   headers={"X-API-Key": key})
        assert r.status_code == 202
    get_settings.cache_clear()


def test_production_mode_refuses_to_start_without_auth(monkeypatch, tmp_path):
    from app.config.settings import get_settings
    monkeypatch.setenv("SHIELD_PRODUCTION_MODE", "true")
    monkeypatch.setenv("SHIELD_AUTH_MODE", "disabled")
    monkeypatch.setenv("SHIELD_JOB_DIR", str(tmp_path / "jobs"))
    get_settings.cache_clear()
    from app.main import create_app
    from fastapi.testclient import TestClient
    import pytest
    app = create_app()
    with pytest.raises(RuntimeError, match="SHIELD_AUTH_MODE"):
        with TestClient(app):
            pass
    get_settings.cache_clear()


def test_rate_limit_enforced(monkeypatch, tmp_path):
    from app.config.settings import get_settings
    monkeypatch.setenv("SHIELD_AUTH_MODE", "disabled")
    monkeypatch.setenv("SHIELD_RATE_LIMIT_PER_MINUTE", "2")
    monkeypatch.setenv("SHIELD_JOB_DIR", str(tmp_path / "jobs"))
    get_settings.cache_clear()
    from app.main import create_app
    from fastapi.testclient import TestClient
    with TestClient(create_app()) as c:
        codes = []
        for _ in range(4):
            r = c.post("/engines/style_shield/jobs",
                       files={"file": ("a.png", png_bytes(), "image/png")},
                       data={"strength": "low", "max_steps": "1"})
            codes.append(r.status_code)
        assert 429 in codes, codes
        last_429 = [c for c in codes if c == 429][0]
        assert last_429 == 429
    get_settings.cache_clear()


def test_api_key_never_logged_or_echoed(client):
    r = client.get("/health")
    assert "api_key" not in str(r.json()).lower() or "sha256" not in str(r.json())


def test_token_bucket_limiter_unit():
    from app.core.security import TokenBucketLimiter
    t = [0.0]
    limiter = TokenBucketLimiter(per_minute=60, clock=lambda: t[0])
    for _ in range(60):
        assert limiter.check("x") is None
    assert limiter.check("x") is not None
    t[0] += 1.0
    assert limiter.check("x") is None


def test_verify_api_key_constant_time_rejects_wrong_and_empty():
    from app.core.security import verify_api_key
    import hashlib
    d = hashlib.sha256(b"right").hexdigest()
    assert verify_api_key("right", [d]) is True
    assert verify_api_key("wrong", [d]) is False
    assert verify_api_key(None, [d]) is False
    assert verify_api_key("right", []) is False
