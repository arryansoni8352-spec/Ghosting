"""Job lifecycle, downloads, cleanup, options validation and real end-to-end round trips."""
import io
import time

import pytest

import numpy as np
from PIL import Image

from app.evaluation import art_generator
from tests.api.conftest import png_bytes


def _wait_terminal(client, job_id, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = client.get(f"/jobs/{job_id}").json()
        if s["state"] in ("succeeded", "failed", "cancelled", "timed_out"):
            return s
        time.sleep(0.2)
    raise AssertionError("job did not reach a terminal state in time")


@pytest.mark.model
def test_job_round_trip_real_png(real_client):
    client = real_client
    files = {"file": ("a.png", png_bytes(size=48), "image/png")}
    r = client.post("/engines/style_shield/jobs", files=files,
                    data={"strength": "low", "max_steps": "3"})
    assert r.status_code == 202
    job = r.json()
    assert job["state"] in ("queued", "running")  # worker may already have started
    status = _wait_terminal(client, job["job_id"])
    assert status["state"] == "succeeded", status
    assert status["output_available"] is True

    rec = client.get(f"/jobs/{job['job_id']}/record")
    assert rec.status_code == 200
    assert rec.json()["effectiveness"] is None

    out = client.get(f"/jobs/{job['job_id']}/output")
    assert out.status_code == 200
    assert out.headers["content-type"] == "image/png"
    img = Image.open(io.BytesIO(out.content))
    assert img.format == "PNG"
    assert img.size == (48, 48)


def test_job_id_is_unpredictable_and_unknown_id_is_404(client):
    files = {"file": ("a.png", png_bytes(), "image/png")}
    r1 = client.post("/engines/style_shield/jobs", files=files, data={"strength": "low", "max_steps": "2"})
    r2 = client.post("/engines/style_shield/jobs", files=files, data={"strength": "low", "max_steps": "2"})
    assert r1.json()["job_id"] != r2.json()["job_id"]
    assert len(r1.json()["job_id"]) >= 32
    assert client.get("/jobs/does-not-exist").status_code == 404
    assert client.get("/jobs/../../etc/passwd").status_code == 404


def test_record_and_output_unavailable_before_completion(client):
    files = {"file": ("a.png", png_bytes(size=64), "image/png")}
    r = client.post("/engines/style_shield/jobs", files=files, data={"strength": "balanced", "max_steps": "40"})
    job_id = r.json()["job_id"]
    status = client.get(f"/jobs/{job_id}").json()
    if status["state"] not in ("succeeded",):
        rec = client.get(f"/jobs/{job_id}/record")
        assert rec.status_code in (404, 409)
    client.post(f"/jobs/{job_id}/cancel")
    _wait_terminal(client, job_id)


def test_cancel_running_job(client):
    files = {"file": ("a.png", png_bytes(size=64), "image/png")}
    r = client.post("/engines/style_shield/jobs", files=files, data={"strength": "balanced", "max_steps": "200"})
    job_id = r.json()["job_id"]
    time.sleep(0.3)
    c = client.post(f"/jobs/{job_id}/cancel")
    assert c.status_code == 202
    status = _wait_terminal(client, job_id, timeout=30)
    assert status["state"] in ("cancelled", "timed_out", "succeeded")


def test_delete_job_removes_output(client):
    files = {"file": ("a.png", png_bytes(size=48), "image/png")}
    r = client.post("/engines/style_shield/jobs", files=files, data={"strength": "low", "max_steps": "2"})
    job_id = r.json()["job_id"]
    _wait_terminal(client, job_id)
    assert client.delete(f"/jobs/{job_id}").status_code == 204
    assert client.get(f"/jobs/{job_id}").status_code == 404
    assert client.get(f"/jobs/{job_id}/output").status_code == 404


def test_expired_job_output_becomes_unavailable(client, monkeypatch):
    from app.config.settings import get_settings
    monkeypatch.setenv("SHIELD_JOB_TTL_SECONDS", "60")
    get_settings.cache_clear()
    files = {"file": ("a.png", png_bytes(size=48), "image/png")}
    r = client.post("/engines/style_shield/jobs", files=files, data={"strength": "low", "max_steps": "2"})
    job_id = r.json()["job_id"]
    _wait_terminal(client, job_id)
    mgr = client.app.state.jobs
    job = mgr.get(job_id)
    job.expires_at = time.time() - 1   # force expiry without waiting a real hour
    removed = mgr.sweep()
    assert removed >= 1
    assert client.get(f"/jobs/{job_id}").status_code == 404


def test_temp_files_cleaned_up_after_terminal_state(client):
    mgr = client.app.state.jobs
    files = {"file": ("a.png", png_bytes(size=48), "image/png")}
    r = client.post("/engines/style_shield/jobs", files=files, data={"strength": "low", "max_steps": "2"})
    job_id = r.json()["job_id"]
    _wait_terminal(client, job_id)
    client.delete(f"/jobs/{job_id}")
    assert not (mgr.root / job_id).exists()


def test_invalid_format_is_rejected_before_a_job_is_created(client):
    """Format validation runs before queueing: a corrupt upload never becomes a job at all."""
    files = {"file": ("bad.png", b"not an image", "image/png")}
    r = client.post("/engines/style_shield/jobs", files=files, data={"strength": "low"})
    assert r.status_code == 400
    assert "job_id" not in r.json()


def test_failed_job_leaves_no_temp_directory(client, monkeypatch):
    """A failure DURING processing (after the job is queued) must still clean up its directory."""
    from app.engines.style_shield import engine as engine_mod

    def boom(self, src, *a, **kw):
        raise RuntimeError("synthetic processing failure")

    monkeypatch.setattr(engine_mod.StyleShieldEngine, "run", boom)
    mgr = client.app.state.jobs
    files = {"file": ("a.png", png_bytes(size=48), "image/png")}
    r = client.post("/engines/style_shield/jobs", files=files, data={"strength": "low", "max_steps": "2"})
    job_id = r.json()["job_id"]
    status = _wait_terminal(client, job_id)
    assert status["state"] == "failed"
    assert status["error"]["code"] == "internal_error"
    assert "synthetic" not in str(status["error"]["message"])   # internal detail not leaked
    assert not (mgr.root / job_id).exists()


def test_invalid_options_rejected(client):
    files = {"file": ("a.png", png_bytes(), "image/png")}
    bad = [
        {"strength": "extreme"},
        {"strength": "low", "output_format": "bmp"},
        {"strength": "low", "quality": "0"},
        {"strength": "low", "quality": "101"},
        {"strength": "low", "max_steps": "0"},
        {"strength": "low", "max_steps": "99999"},
        {"strength": "low", "seed": "-1"},
    ]
    for data in bad:
        r = client.post("/engines/style_shield/jobs", files=files, data=data)
        assert r.status_code == 422, data


def test_unknown_option_field_rejected_at_schema_level():
    from pydantic import ValidationError
    import pytest
    from app.schemas.protect import ProtectOptions
    with pytest.raises(ValidationError):
        ProtectOptions(brightness=1.5)


def test_jpeg_with_alpha_rejected_before_queueing(client):
    arr = art_generator.paint("A1", 1, 48)
    im = Image.fromarray(arr).convert("RGBA")
    alpha = np.full((48, 48), 128, np.uint8)
    im.putalpha(Image.fromarray(alpha))
    b = io.BytesIO(); im.save(b, "PNG")
    r = client.post("/engines/style_shield/jobs", files={"file": ("a.png", b.getvalue(), "image/png")},
                    data={"strength": "low", "output_format": "jpeg"})
    assert r.status_code == 422
    assert "transparency" in r.json()["message"].lower()


@pytest.mark.model
def test_real_webp_round_trip(real_client):
    client = real_client
    """Uses webp_lossless=True: plain lossy WebP cannot currently satisfy any preset's budget
    (its own codec distortion alone exceeds it, measured in tests/style_shield/test_engine.py),
    so the engine refuses it safely rather than return an out-of-budget image. See README."""
    arr = art_generator.paint("A3", 2, 48)
    b = io.BytesIO(); Image.fromarray(arr).save(b, "WEBP", quality=90)
    r = client.post("/engines/style_shield/jobs", files={"file": ("a.webp", b.getvalue(), "image/webp")},
                    data={"strength": "low", "output_format": "webp", "webp_lossless": "true", "max_steps": "3"})
    job_id = r.json()["job_id"]
    status = _wait_terminal(client, job_id)
    assert status["state"] == "succeeded", status
    out = client.get(f"/jobs/{job_id}/output")
    assert out.headers["content-type"] == "image/webp"
    assert Image.open(io.BytesIO(out.content)).format == "WEBP"


def test_plain_lossy_webp_fails_safely(client):
    """Confirms the known limitation end-to-end through the real API: lossy WebP at default
    settings cannot satisfy the budget and is refused rather than silently exceeding it."""
    arr = art_generator.paint("A3", 2, 48)
    b = io.BytesIO(); Image.fromarray(arr).save(b, "WEBP", quality=90)
    r = client.post("/engines/style_shield/jobs", files={"file": ("a.webp", b.getvalue(), "image/webp")},
                    data={"strength": "low", "output_format": "webp", "max_steps": "3"})
    # The codec's own distortion is measured at upload time, so the refusal is immediate (no job).
    assert r.status_code == 422
    assert r.json()["error"] == "budget_unsatisfiable"
    assert "job_id" not in r.json()


def test_sync_endpoint_falls_back_to_async_when_slow(client, monkeypatch):
    from app.config.settings import get_settings
    monkeypatch.setenv("SHIELD_SYNC_WAIT_SECONDS", "1")
    get_settings.cache_clear()
    files = {"file": ("a.png", png_bytes(size=64), "image/png")}
    r = client.post("/engines/style_shield/protect", files=files,
                    data={"strength": "balanced", "max_steps": "500"})
    assert r.status_code in (200, 202)
    if r.status_code == 202:
        assert "job_id" in r.json()
        client.post(f"/jobs/{r.json()['job_id']}/cancel")
