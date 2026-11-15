"""Job ownership, image input policy, capabilities, honest engine-unavailable errors, headers."""
import io
import json
import time

from PIL import Image

from app.evaluation import art_generator
from tests.api.conftest import png_bytes


def _wait(client, job_id, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = client.get(f"/jobs/{job_id}").json()
        if s["state"] in ("succeeded", "failed", "cancelled", "timed_out"):
            return s
        time.sleep(0.1)
    raise AssertionError("no terminal state")


def _make_job(client, steps="2"):
    r = client.post("/engines/style_shield/jobs", files={"file": ("a.png", png_bytes(size=48), "image/png")},
                    data={"strength": "low", "max_steps": steps})
    assert r.status_code == 202, r.text
    return r.json()


# ------------------------------------------------------------------ ownership
def test_creation_returns_owner_token_once(client):
    job = _make_job(client)
    assert len(job["owner_token"]) >= 40
    status = client.get(f"/jobs/{job['job_id']}").json()
    assert "owner_token" not in status and "owner_digest" not in json.dumps(status)


def test_job_requires_the_owners_token(raw_client):
    job = _make_job(raw_client)
    jid, tok = job["job_id"], job["owner_token"]
    for headers in ({}, {"X-Job-Token": "wrong"}, {"X-Job-Token": tok[:-1] + ("A" if tok[-1] != "A" else "B")}):
        assert raw_client.get(f"/jobs/{jid}", headers=headers).status_code == 404
        assert raw_client.get(f"/jobs/{jid}/output", headers=headers).status_code == 404
        assert raw_client.get(f"/jobs/{jid}/record", headers=headers).status_code == 404
        assert raw_client.post(f"/jobs/{jid}/cancel", headers=headers).status_code == 404
        assert raw_client.delete(f"/jobs/{jid}", headers=headers).status_code == 404
    ok = {"X-Job-Token": tok}
    assert raw_client.get(f"/jobs/{jid}", headers=ok).status_code == 200
    # a foreign-token 404 is byte-identical to an unknown-id 404 (no existence oracle)
    unknown = raw_client.get("/jobs/" + "A" * 43, headers={"X-Job-Token": "x"})
    foreign = raw_client.get(f"/jobs/{jid}", headers={"X-Job-Token": "x"})
    assert unknown.status_code == foreign.status_code == 404 and unknown.json() == foreign.json()
    raw_client.post(f"/jobs/{jid}/cancel", headers=ok)


def test_second_users_job_is_isolated(raw_client):
    a, b = _make_job(raw_client), _make_job(raw_client)
    assert a["owner_token"] != b["owner_token"]
    assert raw_client.get(f"/jobs/{a['job_id']}", headers={"X-Job-Token": b["owner_token"]}).status_code == 404
    done = raw_client.get(f"/jobs/{b['job_id']}", headers={"X-Job-Token": b["owner_token"]})
    assert done.status_code == 200


def test_owner_can_delete_and_output_disappears(client):
    job = _make_job(client)
    _wait(client, job["job_id"])
    assert client.get(f"/jobs/{job['job_id']}/output").status_code == 200
    assert client.delete(f"/jobs/{job['job_id']}").status_code == 204
    assert client.get(f"/jobs/{job['job_id']}/output").status_code == 404
    assert not (client.app.state.jobs.root / job["job_id"]).exists()


def test_status_exposes_no_paths_or_input(client):
    job = _make_job(client)
    s = client.get(f"/jobs/{job['job_id']}").json()
    assert set(s) == {"job_id", "engine", "kind", "state", "stage", "progress", "created_at", "started_at",
                      "finished_at", "expires_at", "error", "output_available"}
    root = str(client.app.state.jobs.root)
    _wait(client, job["job_id"])
    text = client.get(f"/jobs/{job['job_id']}").text + client.get(f"/jobs/{job['job_id']}/record").text
    assert root not in text and "/tmp" not in text


# ------------------------------------------------------------- input policy
def _lossless_webp(size=48):
    b = io.BytesIO()
    Image.fromarray(art_generator.paint("A3", 2, size)).save(b, "WEBP", lossless=True)
    return b.getvalue()


def _lossy_webp(size=48):
    b = io.BytesIO()
    Image.fromarray(art_generator.paint("A3", 2, size)).save(b, "WEBP", quality=90)
    return b.getvalue()


def _jpeg(size=48):
    b = io.BytesIO()
    Image.fromarray(art_generator.paint("A3", 2, size)).save(b, "JPEG", quality=95)
    return b.getvalue()


def test_default_policy_accepts_png_and_lossless_webp(client_factory):
    c = client_factory(SHIELD_IMAGE_INPUT_POLICY="lossless_only")
    r = c.post("/engines/style_shield/jobs", files={"file": ("a.png", png_bytes(), "image/png")},
               data={"strength": "low", "max_steps": "1"})
    assert r.status_code == 202
    r = c.post("/engines/style_shield/jobs", files={"file": ("a.webp", _lossless_webp(), "image/webp")},
               data={"strength": "low", "max_steps": "1", "output_format": "webp", "webp_lossless": "true"})
    assert r.status_code == 202, r.text


def test_default_policy_rejects_jpeg_upload(client_factory):
    c = client_factory(SHIELD_IMAGE_INPUT_POLICY="lossless_only")
    r = c.post("/engines/style_shield/jobs", files={"file": ("a.jpg", _jpeg(), "image/jpeg")},
               data={"strength": "low"})
    assert r.status_code == 400 and r.json()["error"] == "unsupported_image"
    assert "JPEG" in r.json()["message"] and "job_id" not in r.json()


def test_default_policy_rejects_lossy_webp_upload(client_factory):
    c = client_factory(SHIELD_IMAGE_INPUT_POLICY="lossless_only")
    r = c.post("/engines/style_shield/jobs", files={"file": ("a.webp", _lossy_webp(), "image/webp")},
               data={"strength": "low"})
    assert r.status_code == 400 and "Lossy WebP" in r.json()["message"]


def test_webp_losslessness_detection():
    from app.utils import images
    assert images.webp_is_lossless(_lossless_webp()) is True
    assert images.webp_is_lossless(_lossy_webp()) is False


def test_lossy_output_that_cannot_meet_budget_is_refused_at_upload(client):
    # detailed content: JPEG q95 alone changes pixels by ~200 levels, far over the 4-level 'low' budget
    import numpy as np
    arr = np.random.default_rng(0).integers(0, 256, (48, 48, 3), dtype=np.uint8)
    b = io.BytesIO(); Image.fromarray(arr).save(b, "PNG")
    r = client.post("/engines/style_shield/jobs", files={"file": ("a.png", b.getvalue(), "image/png")},
                    data={"strength": "low", "output_format": "jpeg", "quality": "95"})
    assert r.status_code == 422 and r.json()["error"] == "budget_unsatisfiable"


def test_oversized_image_dimensions_and_bytes_rejected(client_factory):
    c = client_factory(SHIELD_MAX_INPUT_PIXELS="4096")
    r = c.post("/engines/style_shield/jobs", files={"file": ("a.png", png_bytes(size=96), "image/png")})
    assert r.status_code == 413 and r.json()["error"] == "image_too_large"
    c2 = client_factory(SHIELD_MAX_UPLOAD_MB="1")
    r = c2.post("/engines/style_shield/jobs", files={"file": ("a.png", b"\x89PNG\r\n\x1a\n" + b"0" * (2 << 20), "image/png")})
    assert r.status_code == 413


# ------------------------------------------------- honest engine unavailability
def test_engine_without_weights_returns_honest_503_and_creates_no_job(real_client):
    """No weights are installed in the test environment and downloading is off by default."""
    r = real_client.post("/engines/style_shield/jobs", files={"file": ("a.png", png_bytes(), "image/png")},
                         data={"strength": "low"})
    assert r.status_code == 503 and r.json()["error"] == "model_unavailable"
    assert "job_id" not in r.json()
    assert real_client.app.state.jobs.counts()["queued"] == 0
    cap = real_client.get("/capabilities").json()
    assert cap["image"]["ready"] is False and cap["image"]["readiness"]["code"] == "model_not_installed"
    assert cap["video"]["ready"] is False


def test_production_mode_disables_engine_while_licence_unresolved(client_factory, tmp_path):
    from app.engines.style_shield.engine import StyleShieldEngine
    import pytest
    from app.config.settings import get_settings
    pytest.MonkeyPatch  # noqa
    import os
    os.environ["SHIELD_PRODUCTION_MODE"] = "true"
    os.environ["SHIELD_AUTH_MODE"] = "open"
    get_settings.cache_clear()
    try:
        r = StyleShieldEngine().readiness()
        assert r["ready"] is False and r["code"] == "model_licence_unconfirmed"
    finally:
        os.environ.pop("SHIELD_PRODUCTION_MODE"); os.environ.pop("SHIELD_AUTH_MODE")
        get_settings.cache_clear()


# ----------------------------------------------------------- capabilities etc.
def test_capabilities_contents(client):
    cap = client.get("/capabilities").json()
    assert cap["experimental_notice"].startswith("Experimental")
    assert "not yet been independently validated" in cap["experimental_notice"]
    from app.engines.style_shield import optimise as opt
    assert {p["id"] for p in cap["image"]["presets"]} == set(opt.PRESETS)
    assert cap["third_party_services"] == [] and cap["retention"]["job_ttl_seconds"] == 60
    assert cap["video"]["limits"]["max_protected_keyframes"] >= 1
    assert str(client.app.state.jobs.root) not in json.dumps(cap)


def test_security_headers_on_every_response(client):
    for path in ("/health", "/capabilities", "/jobs/nope"):
        h = client.get(path).headers
        assert h["x-content-type-options"] == "nosniff" and h["cache-control"] == "no-store"
        assert h["referrer-policy"] == "no-referrer"


def test_cors_allows_only_configured_origin(client_factory):
    c = client_factory(SHIELD_CORS_ORIGINS="https://ghosting.site")
    ok = c.options("/capabilities", headers={"Origin": "https://ghosting.site", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "https://ghosting.site"
    bad = c.options("/capabilities", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_status_polling_is_not_throttled_by_the_upload_rate_limit(client_factory):
    c = client_factory(SHIELD_RATE_LIMIT_PER_MINUTE="3", SHIELD_READ_RATE_LIMIT_PER_MINUTE="600")
    job = c.post("/engines/style_shield/jobs", files={"file": ("a.png", png_bytes(), "image/png")},
                 data={"strength": "low", "max_steps": "5"}).json()
    codes = [c.get(f"/jobs/{job['job_id']}").status_code for _ in range(20)]
    assert set(codes) == {200}
    c.post(f"/jobs/{job['job_id']}/cancel")


def test_open_auth_mode_needs_no_key_but_keeps_tokens(client_factory):
    c = client_factory(SHIELD_AUTH_MODE="open")
    job = c.post("/engines/style_shield/jobs", files={"file": ("a.png", png_bytes(), "image/png")},
                 data={"strength": "low", "max_steps": "1"})
    assert job.status_code == 202
    from fastapi.testclient import TestClient
    jid = job.json()["job_id"]
    assert c.get(f"/jobs/{jid}", headers={"X-Job-Token": "nope"}).status_code == 404
