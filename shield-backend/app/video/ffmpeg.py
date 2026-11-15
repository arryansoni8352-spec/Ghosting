"""Safe subprocess execution for ffmpeg and ffprobe.

- Arguments are always a list; there is no shell and no string interpolation.
- Every call has a timeout, and polls a cancel flag so cancellation and job timeouts kill the child.
- stderr goes to a temporary file (no pipe-buffer deadlock); only a short sanitised tail is ever
  surfaced in logs, never in client responses.
- Inputs are opened with a forced demuxer and `-protocol_whitelist file`, so a media file cannot make
  ffmpeg read other files or the network.
"""
from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import time
from typing import Callable

from app.core.errors import JobCancelled, VideoProcessingError

log = logging.getLogger("ghosting_shield.video.ffmpeg")
POLL_S = 0.1


def _scrub_env() -> dict:
    keep = {k: v for k, v in os.environ.items() if k in ("PATH", "LANG", "LC_ALL", "TMPDIR", "HOME")}
    keep["AV_LOG_FORCE_NOCOLOR"] = "1"
    return keep


def run(args: list[str], *, timeout_s: float, should_stop: Callable[[], bool] = lambda: False,
        on_poll: Callable[[], None] | None = None, capture_stdout: bool = False) -> bytes:
    """Run a command to completion. Returns stdout bytes if `capture_stdout`, else b''.

    Raises JobCancelled if `should_stop()` turns true, VideoProcessingError on timeout, a missing
    binary or a non-zero exit.
    """
    if not isinstance(args, list) or not all(isinstance(a, str) for a in args):
        raise TypeError("args must be a list of strings")
    err = tempfile.TemporaryFile()
    out = tempfile.TemporaryFile() if capture_stdout else subprocess.DEVNULL
    try:
        try:
            proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                                    shell=False, env=_scrub_env(), close_fds=True)
        except (FileNotFoundError, PermissionError, OSError) as exc:
            raise VideoProcessingError("The video tools are not available on this server.") from exc
        deadline = time.monotonic() + timeout_s
        try:
            while proc.poll() is None:
                if should_stop():
                    _kill(proc)
                    raise JobCancelled()
                if time.monotonic() > deadline:
                    _kill(proc)
                    raise VideoProcessingError("A video processing step exceeded its time limit.",
                                               code="video_step_timeout")
                if on_poll:
                    on_poll()
                time.sleep(POLL_S)
        except BaseException:
            _kill(proc)
            raise
        if proc.returncode != 0:
            err.seek(0)
            tail = err.read()[-400:].decode("utf-8", "replace")
            log.warning("subprocess exited %s: %s", proc.returncode, tail.replace("\n", " | "))
            raise VideoProcessingError("A video processing step failed.",
                                       code="video_step_failed")
        if capture_stdout:
            out.seek(0)
            return out.read()
        return b""
    finally:
        err.close()
        if capture_stdout:
            out.close()


def _kill(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.kill()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:  # pragma: no cover
            pass
