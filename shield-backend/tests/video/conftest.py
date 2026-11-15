"""Helpers for Video Shield tests: tiny synthetic videos made with ffmpeg, and a stand-in protector.

No model weights are needed. `FakeProtector` replaces the image engine so the pipeline, audio
handling, validation and temporal logic are tested for real while the expensive AI step is mocked.
"""
import subprocess
import time
from pathlib import Path

import numpy as np
import pytest

from app.video.limits import VideoLimits


def ff(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True, stdin=subprocess.DEVNULL)


def make_video(path: Path, *, seconds=2, fps=12, size="96x64", audio=True, vcodec="libx264",
               acodec="aac", source="testsrc2", extra_v=(), extra_a=()) -> Path:
    inputs = ["-f", "lavfi", "-i", f"{source}=size={size}:rate={fps}:duration={seconds}"]
    if audio:
        inputs += ["-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=44100:duration={seconds}"]
    cmd = inputs + ["-c:v", vcodec, *extra_v]
    if vcodec in ("libx264",):
        cmd += ["-pix_fmt", "yuv420p"]
    if audio:
        cmd += ["-c:a", acodec, *extra_a]
    ff(*cmd, str(path))
    return path


def make_two_scene_video(path: Path, *, fps=12, size="96x64", audio=False) -> Path:
    """1 s of one colour, then 1 s of a very different one: one hard cut at frame `fps`."""
    ff("-f", "lavfi", "-i", f"color=c=0x203040:size={size}:rate={fps}:duration=1",
       "-f", "lavfi", "-i", f"color=c=0xe0d080:size={size}:rate={fps}:duration=1",
       "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
       "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path))
    return path


class FakeProtector:
    """Deterministic stand-in for the image engine: independent +/-m noise per call."""

    def __init__(self, m=4, delay=0.0):
        self.budget_levels = m
        self.delay = delay
        self.calls = []

    def protect(self, rgb, control, index):
        self.calls.append(index)
        t0 = time.time()
        while time.time() - t0 < self.delay:
            if control.should_stop():
                from app.core.errors import JobCancelled
                raise JobCancelled()
            control.progress("optimising", min(0.99, (time.time() - t0) / self.delay))
            time.sleep(0.02)
        rng = np.random.default_rng(index)
        noise = rng.integers(-self.budget_levels, self.budget_levels + 1, rgb.shape)
        return np.clip(rgb.astype(np.int16) + noise, 0, 255).astype(np.uint8), {"stub": True}


@pytest.fixture
def limits():
    return VideoLimits(max_upload_bytes=50 << 20, max_duration_s=10, max_pixels=262144, max_fps=30,
                       max_frames=300, max_keyframes=4, max_temp_bytes=1 << 30, ffmpeg_timeout_s=60,
                       ffmpeg_path="ffmpeg", ffprobe_path="ffprobe")


@pytest.fixture
def vid_dir(tmp_path):
    d = tmp_path / "vid"
    d.mkdir()
    return d


@pytest.fixture
def workdir(tmp_path):
    d = tmp_path / "work"
    d.mkdir()
    return d
