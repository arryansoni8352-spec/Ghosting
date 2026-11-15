"""Video Shield HTTP API: upload validation, ownership, progress, cancel, output, cleanup."""
import os
import time

import pytest

from tests.api.conftest import app_env, client_factory, stub_engine, _make_client_class  # noqa: F401
from tests.video.conftest import FakeProtector, make_two_scene_video, make_video


@pytest.fixture
def vclient(client_factory):
    def make(delay=0.0, **env):
        c = client_factory(**env)
        c.app.state.video_protector_factory = lambda opts: FakeProtector(4, delay=delay)
        return c
    return make


def post(c, path, **data):
    return c.post("/video/jobs", files={"file": (path.name, path.read_bytes(), "video/mp4")}, data=data)


def wait(c, jid, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = c.get(f"/jobs/{jid}").json()
        if s["state"] in ("succeeded", "failed", "cancelled", "timed_out"):
            return s
        time.sleep(0.1)
    raise AssertionError("timeout")


def test_full_video_job_flow(vclient, vid_dir):
    c = vclient()
    r = post(c, make_video(vid_dir / "a.mp4"), output_profile="compatible", temporal_mode="flow")
    assert r.status_code == 202, r.text
    job = r.json()
    assert job["input"]["video_codec"] == "h264" and job["input"]["audio"]["codec"] == "aac" and job["owner_token"]
    s = wait(c, job["job_id"])
    assert s["state"] == "succeeded" and s["kind"] == "video" and s["progress"] == 1.0 and s["output_available"]
    out = c.get(f"/jobs/{job['job_id']}/output")
    assert out.status_code == 200 and out.headers["content-type"] == "video/mp4" and out.content[4:8] == b"ftyp"
    rec = c.get(f"/jobs/{job['job_id']}/record").json()
    assert rec["effectiveness"] is None and rec["audio"]["present"] and rec["validation"]["frame_count_preserved"]
    root = c.app.state.jobs.root
    assert sorted(p.name for p in (root / job["job_id"]).iterdir()) == ["output.mp4"]       # no frames left
    assert c.delete(f"/jobs/{job['job_id']}").status_code == 204
    assert not (root / job["job_id"]).exists()


def test_video_job_is_owned(vclient, vid_dir):
    c = vclient()
    job = post(c, make_video(vid_dir / "a.mp4")).json()
    wait(c, job["job_id"])
    from fastapi.testclient import TestClient
    stranger = TestClient(c.app)                     # same server, no token
    for h in ({}, {"X-Job-Token": "bad"}):
        assert stranger.get(f"/jobs/{job['job_id']}/output", headers=h).status_code == 404
        assert stranger.delete(f"/jobs/{job['job_id']}", headers=h).status_code == 404
    assert c.get(f"/jobs/{job['job_id']}/output").status_code == 200


def test_progress_reports_real_stages(vclient, vid_dir):
    c = vclient(delay=1.5)
    job = post(c, make_video(vid_dir / "a.mp4")).json()
    stages = set()
    t0 = time.time()
    while time.time() - t0 < 30:
        s = c.get(f"/jobs/{job['job_id']}").json()
        stages.add(s["stage"])
        if s["state"] in ("succeeded", "failed"):
            break
        time.sleep(0.05)
    assert any(x.startswith("protecting_keyframe_1_of_1") for x in stages) and s["state"] == "succeeded"


def test_cancel_running_video_job_cleans_up(vclient, vid_dir):
    c = vclient(delay=30)
    job = post(c, make_video(vid_dir / "a.mp4")).json()
    t0 = time.time()
    while time.time() - t0 < 20 and not c.get(f"/jobs/{job['job_id']}").json()["stage"].startswith("protecting"):
        time.sleep(0.05)
    assert c.post(f"/jobs/{job['job_id']}/cancel").status_code == 202
    s = wait(c, job["job_id"], 20)
    assert s["state"] == "cancelled"
    assert not (c.app.state.jobs.root / job["job_id"]).exists()


def test_unsupported_signature_rejected(vclient):
    c = vclient()
    r = c.post("/video/jobs", files={"file": ("x.mp4", b"GIF89a" + b"0" * 100, "video/mp4")})
    assert r.status_code == 415 and r.json()["error"] == "unsupported_video"


def test_corrupt_video_rejected_before_queueing(vclient):
    c = vclient()
    r = c.post("/video/jobs", files={"file": ("x.mp4", b"\x00\x00\x00\x18ftypmp42" + os.urandom(3000), "video/mp4")})
    assert r.status_code == 400 and r.json()["error"] == "video_corrupt"
    assert c.app.state.jobs.counts()["queued"] == 0


def test_unsupported_codec_rejected(vclient, vid_dir):
    c = vclient()
    r = post(c, make_video(vid_dir / "m.mp4", vcodec="mpeg4", audio=False))
    assert r.status_code == 415 and "mpeg4" in r.json()["message"]


def test_oversized_upload_rejected(vclient):
    c = vclient(SHIELD_VIDEO_MAX_UPLOAD_MB="1")
    r = c.post("/video/jobs", files={"file": ("big.mp4", b"\x00\x00\x00\x18ftypmp42" + b"0" * (2 << 20), "video/mp4")})
    assert r.status_code == 413 and r.json()["error"] == "upload_too_large"


@pytest.mark.parametrize("env,fragment", [({"SHIELD_VIDEO_MAX_DURATION_S": "1"}, "long"),
                                         ({"SHIELD_VIDEO_MAX_PIXELS": "2048"}, "pixels"),
                                         ({"SHIELD_VIDEO_MAX_FRAMES": "10"}, "frames")])
def test_duration_resolution_frame_limits(vclient, vid_dir, env, fragment):
    c = vclient(**env)
    r = post(c, make_video(vid_dir / "a.mp4"))
    assert r.status_code == 413 and r.json()["error"] == "video_limit_exceeded" and fragment in r.json()["message"]


def test_scene_budget_failure_is_reported_on_the_job(vclient, vid_dir):
    c = vclient(SHIELD_VIDEO_MAX_KEYFRAMES="1")
    job = post(c, make_two_scene_video(vid_dir / "s.mp4")).json()
    s = wait(c, job["job_id"])
    assert s["state"] == "failed" and s["error"]["code"] == "video_limit_exceeded"
    assert not (c.app.state.jobs.root / job["job_id"]).exists()


def test_invalid_options_rejected(vclient, vid_dir):
    c = vclient()
    p = make_video(vid_dir / "a.mp4", audio=False)
    for bad in ({"output_profile": "gif"}, {"temporal_mode": "magic"}, {"strength": "extreme"}, {"max_steps": "0"}):
        assert post(c, p, **bad).status_code == 422, bad


def test_video_disabled_switch(vclient, vid_dir):
    c = vclient(SHIELD_VIDEO_ENABLED="false")
    assert post(c, make_video(vid_dir / "a.mp4", audio=False)).status_code == 404
    assert c.get("/capabilities").json()["video"]["enabled"] is False


def test_real_engine_unavailable_gives_honest_error_for_video(client_factory, vid_dir):
    c = client_factory(stub=False)       # no weights installed, download off
    r = post(c, make_video(vid_dir / "a.mp4", audio=False))
    assert r.status_code == 503 and r.json()["error"] == "model_unavailable"
    assert c.app.state.jobs.counts()["queued"] == 0
