"""The privacy disclosure promises the server does not log file names, contents or tokens. Verify it."""
import logging
import time

import pytest

from tests.api.conftest import png_bytes
from tests.video.conftest import FakeProtector, make_video


def _wait(c, jid):
    for _ in range(300):
        if c.get(f"/jobs/{jid}").json()["state"] in ("succeeded", "failed", "cancelled", "timed_out"):
            return
        time.sleep(0.1)


def test_image_job_logs_contain_no_filename_token_or_content(client, caplog):
    caplog.set_level(logging.DEBUG)
    r = client.post("/engines/style_shield/jobs", files={"file": ("my-secret-holiday.png", png_bytes(), "image/png")},
                    data={"strength": "low", "max_steps": "1"}).json()
    _wait(client, r["job_id"])
    client.get(f"/jobs/{r['job_id']}/output")
    client.delete(f"/jobs/{r['job_id']}")
    text = caplog.text
    assert "my-secret-holiday" not in text and r["owner_token"] not in text


def test_failed_video_job_logs_are_clean(client_factory, caplog, vid_dir):
    caplog.set_level(logging.DEBUG)
    c = client_factory(SHIELD_VIDEO_MAX_KEYFRAMES="1")
    c.app.state.video_protector_factory = lambda o: FakeProtector()
    from tests.video.conftest import make_two_scene_video
    p = make_two_scene_video(vid_dir / "private-clip-name.mp4")
    r = c.post("/video/jobs", files={"file": (p.name, p.read_bytes(), "video/mp4")}).json()
    _wait(c, r["job_id"])
    assert "private-clip-name" not in caplog.text and r["owner_token"] not in caplog.text
    assert str(c.app.state.jobs.root) not in "".join(rec.getMessage() for rec in caplog.records
                                                       if rec.name.startswith("ghosting_shield.video.api"))


@pytest.fixture
def vid_dir(tmp_path):
    d = tmp_path / "vid"
    d.mkdir()
    return d
