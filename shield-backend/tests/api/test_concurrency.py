"""Event-loop responsiveness and bounded concurrency while CPU work is in flight."""
import threading
import time

from tests.api.conftest import png_bytes


def test_health_stays_responsive_during_processing(client):
    """A heavier job is queued; /health must answer quickly while it runs in the background."""
    files = {"file": ("a.png", png_bytes(size=64), "image/png")}
    r = client.post("/engines/style_shield/jobs", files=files,
                    data={"strength": "balanced", "max_steps": "150"})
    job_id = r.json()["job_id"]
    time.sleep(0.3)   # let the worker actually start

    latencies = []
    for _ in range(5):
        t0 = time.perf_counter()
        resp = client.get("/health")
        latencies.append(time.perf_counter() - t0)
        assert resp.status_code == 200
    assert max(latencies) < 1.0, latencies   # the event loop is not blocked by CPU work

    client.post(f"/jobs/{job_id}/cancel")


def test_excess_jobs_are_refused_with_503(client):
    """SHIELD_MAX_CONCURRENT_JOBS=1, SHIELD_MAX_QUEUED_JOBS=1 in the test env -> capacity 2."""
    files = {"file": ("a.png", png_bytes(size=64), "image/png")}
    ids, codes = [], []
    for _ in range(4):
        r = client.post("/engines/style_shield/jobs", files=files,
                        data={"strength": "balanced", "max_steps": "100"})
        codes.append(r.status_code)
        if r.status_code == 202:
            ids.append(r.json()["job_id"])
    assert 503 in codes, codes
    for jid in ids:
        client.post(f"/jobs/{jid}/cancel")


def test_timeout_stops_long_running_work(client, monkeypatch):
    """A job that exceeds SHIELD_JOB_TIMEOUT_SECONDS is stopped, not left running forever."""
    from app.config.settings import get_settings
    monkeypatch.setenv("SHIELD_JOB_TIMEOUT_SECONDS", "10")
    get_settings.cache_clear()
    files = {"file": ("a.png", png_bytes(size=64), "image/png")}
    r = client.post("/engines/style_shield/jobs", files=files,
                    data={"strength": "high", "max_steps": "1000"})
    job_id = r.json()["job_id"]
    t0 = time.time()
    state = None
    while time.time() - t0 < 25:
        s = client.get(f"/jobs/{job_id}").json()
        state = s["state"]
        if state in ("timed_out", "succeeded", "failed", "cancelled"):
            break
        time.sleep(0.5)
    assert state == "timed_out", state


def test_cancellation_releases_capacity_promptly(client):
    """After cancelling a queued/running job, capacity frees up for a new one."""
    files = {"file": ("a.png", png_bytes(size=64), "image/png")}
    r1 = client.post("/engines/style_shield/jobs", files=files,
                     data={"strength": "balanced", "max_steps": "200"})
    job_id = r1.json()["job_id"]
    client.post(f"/jobs/{job_id}/cancel")
    t0 = time.time()
    ok = False
    while time.time() - t0 < 15:
        r2 = client.post("/engines/style_shield/jobs", files=files,
                         data={"strength": "low", "max_steps": "1"})
        if r2.status_code == 202:
            ok = True
            client.post(f"/jobs/{r2.json()['job_id']}/cancel")
            break
        time.sleep(0.3)
    assert ok
