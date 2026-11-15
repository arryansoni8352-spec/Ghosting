"""Subprocess safety: no shell, timeouts, kill on cancel, no leakage of tool output."""
import time

import pytest

from app.core.errors import JobCancelled, VideoProcessingError
from app.video import ffmpeg


def test_arguments_must_be_a_list_of_strings():
    with pytest.raises(TypeError):
        ffmpeg.run("echo hi", timeout_s=5)
    with pytest.raises(TypeError):
        ffmpeg.run(["echo", 1], timeout_s=5)


def test_no_shell_interpretation(tmp_path):
    marker = tmp_path / "pwned"
    out = ffmpeg.run(["echo", f"; touch {marker} #", "$(touch " + str(marker) + ")"], timeout_s=5, capture_stdout=True)
    assert not marker.exists() and b"touch" in out        # metacharacters are inert data


def test_timeout_kills_the_child():
    t0 = time.time()
    with pytest.raises(VideoProcessingError) as e:
        ffmpeg.run(["sleep", "30"], timeout_s=0.5)
    assert e.value.code == "video_step_timeout" and time.time() - t0 < 5


def test_cancel_kills_the_child_promptly():
    t0 = time.time()
    with pytest.raises(JobCancelled):
        ffmpeg.run(["sleep", "30"], timeout_s=60, should_stop=lambda: time.time() - t0 > 0.3)
    assert time.time() - t0 < 5


def test_failure_message_does_not_leak_tool_output():
    with pytest.raises(VideoProcessingError) as e:
        ffmpeg.run(["sh", "-c", "echo SECRET-PATH-/srv/x >&2; exit 3"], timeout_s=5)
    assert "SECRET" not in str(e.value) and e.value.code == "video_step_failed"


def test_environment_is_scrubbed(monkeypatch):
    monkeypatch.setenv("SHIELD_API_KEY_SHA256", "should-not-leak")
    out = ffmpeg.run(["sh", "-c", "echo ${SHIELD_API_KEY_SHA256:-absent}"], timeout_s=5, capture_stdout=True)
    assert out.strip() == b"absent"


def test_playlist_style_inputs_are_rejected_by_signature():
    from app.video.signature import sniff_video
    for payload in (b"ffconcat version 1.0\nfile '/etc/passwd'\n", b"#EXTM3U\n#EXTINF:1,\nfile:///etc/passwd\n"):
        assert sniff_video(payload) is None
