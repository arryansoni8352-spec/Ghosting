"""In-process job manager for protection runs.

- Work runs in a bounded thread pool, never on the asyncio event loop.
- Queue depth is bounded; excess submissions are refused with ServerBusyError.
- Each job has a cryptographically random id (secrets.token_urlsafe(32)).
- Timeouts and client cancellations set a cooperative flag that the optimisation loops poll,
  so timed-out work stops at the next step instead of continuing in the background.
- Output lives in a per-job directory under a controlled temporary root. Expired and failed
  jobs are removed. Inputs are held in memory only until processing finishes.
- Ownership: every job has a random owner token returned exactly once at creation. Only its
  SHA-256 digest is kept. Job-level operations (status, record, output, cancel, delete) present the
  token; a missing or wrong token gets the same 404 as an unknown job id.
- Work may return either `output_bytes` or `output_file` (a file inside the job's `work/` directory,
  which the manager moves into place). The `work/` directory is always removed when the job ends.

Limitation: state is in-process. A multi-process or multi-host deployment needs shared storage.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import secrets
import shutil
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from app.core.errors import (
    CorruptImageError, JobCancelled, JobNotFoundError, ServerBusyError, ShieldError,
    VerificationError,
)

log = logging.getLogger("ghosting_shield.jobs")
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")   # token_urlsafe(32) produces 43 characters


class JobState(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"
    timed_out = "timed_out"


_UNCHECKED = object()   # internal callers (watchdog, tests) skip the ownership check


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


TERMINAL = {JobState.succeeded, JobState.failed, JobState.cancelled, JobState.timed_out}


@dataclass
class Job:
    id: str
    engine: str
    options: dict
    created: float
    state: JobState = JobState.queued
    stage: str = "queued"
    progress: float = 0.0
    started: float | None = None
    finished: float | None = None
    expires_at: float | None = None
    error_code: str | None = None
    error_message: str | None = None
    error_status: int = 500
    record: dict | None = None
    output_mime: str | None = None
    output_filename: str | None = None
    output_path: Path | None = None
    input_bytes: bytes | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    future: Any = None
    kind: str = "image"
    owner_digest: str = ""
    issued_token: str | None = None      # raw token, read once by the creating route and cleared

    def public_status(self) -> dict:
        """Status without filesystem paths, input bytes or internal objects."""
        return {
            "job_id": self.id,
            "engine": self.engine,
            "kind": self.kind,
            "state": self.state.value,
            "stage": self.stage,
            "progress": round(self.progress, 4),
            "created_at": self.created,
            "started_at": self.started,
            "finished_at": self.finished,
            "expires_at": self.expires_at,
            "error": ({"code": self.error_code, "message": self.error_message}
                      if self.error_code else None),
            "output_available": self.state == JobState.succeeded and self.output_path is not None,
        }


class JobManager:
    def __init__(self, *, max_workers: int, max_queued: int, timeout_s: float, ttl_s: float,
                 root_dir: str | None = None, clock: Callable[[], float] = time.time):
        self._max_workers = max_workers
        self._max_queued = max_queued
        self._timeout = timeout_s
        self._ttl = ttl_s
        self._clock = clock
        self._lock = threading.Lock()
        self._jobs: dict[str, Job] = {}
        base = Path(root_dir) if root_dir else Path(tempfile.gettempdir()) / "ghosting-shield-jobs"
        base.mkdir(parents=True, exist_ok=True)
        self._root = base.resolve()
        self._pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="shield")
        self._stop = threading.Event()
        self._watchdog = threading.Thread(target=self._watch, name="shield-watchdog", daemon=True)
        self._watchdog.start()
        self.purge_stale_directories()

    # ------------------------------------------------------------- public API
    @property
    def root(self) -> Path:
        return self._root

    def submit(self, engine_name: str, data: bytes, options: dict,
               work: Callable[[Job, bytes], dict], kind: str = "image") -> Job:
        """Queue a job. `work(job, data)` returns {'output_bytes' | 'output_file', 'mime',
        'extension', 'filename', 'record'}. The raw owner token is on `job.issued_token`."""
        with self._lock:
            active = sum(1 for j in self._jobs.values() if j.state in (JobState.queued, JobState.running))
            if active >= self._max_workers + self._max_queued:
                raise ServerBusyError("The server is busy. Try again later.")
            job_id = secrets.token_urlsafe(32)
            token = secrets.token_urlsafe(32)
            job = Job(id=job_id, engine=engine_name, options=dict(options), created=self._clock(),
                      input_bytes=data, kind=kind, owner_digest=_digest(token), issued_token=token)
            self._jobs[job_id] = job
        job.future = self._pool.submit(self._run, job, work)
        return job

    def get(self, job_id: str, token: Any = _UNCHECKED) -> Job:
        """Return a job. Routes always pass the caller's token (possibly None); a missing, wrong or
        malformed token is indistinguishable from an unknown job id."""
        if not isinstance(job_id, str) or not _ID_RE.match(job_id):
            raise JobNotFoundError("No job with that identifier.")
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            raise JobNotFoundError("No job with that identifier.")
        if token is not _UNCHECKED:
            presented = _digest(token) if isinstance(token, str) and 0 < len(token) <= 256 else ""
            if not presented or not hmac.compare_digest(presented, job.owner_digest):
                raise JobNotFoundError("No job with that identifier.")
        return job

    def workdir(self, job: Job) -> Path:
        """Private scratch directory for a running job. Removed when the job ends."""
        d = self._job_dir(job.id) / "work"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def cancel(self, job_id: str, token: Any = _UNCHECKED) -> Job:
        job = self.get(job_id, token)
        job.cancel_event.set()
        with self._lock:
            if job.state == JobState.queued and job.future is not None and job.future.cancel():
                self._finish(job, JobState.cancelled, "cancelled", "cancelled_by_client", "Cancelled.")
        return job

    def delete(self, job_id: str, token: Any = _UNCHECKED) -> None:
        job = self.get(job_id, token)
        if job.state not in TERMINAL:
            job.cancel_event.set()
        with self._lock:
            self._jobs.pop(job.id, None)
        self._remove_dir(job.id)

    def output_path(self, job_id: str, token: Any = _UNCHECKED) -> Path:
        job = self.get(job_id, token)
        if job.state != JobState.succeeded or job.output_path is None:
            raise JobNotFoundError("No output is available for this job.")
        path = job.output_path.resolve()
        if not path.is_file() or self._root not in path.parents:
            raise JobNotFoundError("No output is available for this job.")
        return path

    def sweep(self) -> int:
        """Remove expired terminal jobs and their files. Returns the number removed."""
        now = self._clock()
        removed = []
        with self._lock:
            for jid, job in list(self._jobs.items()):
                if job.state in TERMINAL and job.expires_at is not None and now >= job.expires_at:
                    removed.append(jid)
                    self._jobs.pop(jid, None)
        for jid in removed:
            self._remove_dir(jid)
        return len(removed)

    def counts(self) -> dict:
        with self._lock:
            states = [j.state for j in self._jobs.values()]
        return {s.value: states.count(s) for s in JobState}

    def shutdown(self) -> None:
        self._stop.set()
        for job in list(self._jobs.values()):
            job.cancel_event.set()
        self._pool.shutdown(wait=False, cancel_futures=True)

    def purge_stale_directories(self) -> None:
        """Remove job directories left behind by an earlier process."""
        for child in self._root.iterdir():
            if child.is_dir() and _ID_RE.match(child.name):
                shutil.rmtree(child, ignore_errors=True)

    # --------------------------------------------------------------- internals
    def _job_dir(self, job_id: str) -> Path:
        if not _ID_RE.match(job_id):
            raise ValueError("invalid job id")
        return self._root / job_id

    def _remove_dir(self, job_id: str) -> None:
        d = self._job_dir(job_id)
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)

    def _finish(self, job: Job, state: JobState, stage: str, code: str | None, message: str | None,
                status: int = 500) -> None:
        job.state = state
        job.stage = stage
        job.finished = self._clock()
        job.expires_at = job.finished + self._ttl
        job.error_code = code
        job.error_message = message
        job.error_status = status
        job.input_bytes = None           # never keep the uploaded file after processing
        if state != JobState.succeeded:
            job.output_path = None
            self._remove_dir(job.id)
        else:
            shutil.rmtree(self._job_dir(job.id) / "work", ignore_errors=True)

    def _run(self, job: Job, work: Callable[[Job, bytes], dict]) -> None:
        with self._lock:
            if job.state != JobState.queued:
                return
            job.state = JobState.running
            job.started = self._clock()
            job.stage = "starting"
        data = job.input_bytes or b""
        try:
            result = work(job, data)
            with self._lock:
                still_tracked = job.id in self._jobs
            if not still_tracked:              # deleted while running: write nothing
                raise JobCancelled()
            out_dir = self._job_dir(job.id)
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = out_dir / ("output" + result["extension"])
            if "output_file" in result:
                src_file = Path(result["output_file"]).resolve()
                if out_dir.resolve() not in src_file.parents or not src_file.is_file():
                    raise RuntimeError("work output outside the job directory")
                os.replace(src_file, out_path)
            else:
                tmp = out_dir / "output.part"
                tmp.write_bytes(result["output_bytes"])
                tmp.replace(out_path)
            job.output_path = out_path
            job.output_mime = result["mime"]
            job.output_filename = result["filename"]
            job.record = result["record"]
            job.progress = 1.0
            job.output_path = out_path
            self._finish(job, JobState.succeeded, "completed", None, None)
        except JobCancelled:
            state = JobState.timed_out if self._timed_out(job) else JobState.cancelled
            code = "timed_out" if state == JobState.timed_out else "cancelled"
            msg = ("Processing exceeded the time limit and was stopped."
                   if state == JobState.timed_out else "Processing was cancelled.")
            self._finish(job, state, state.value, code, msg, status=409 if state == JobState.timed_out else 499)
        except ShieldError as exc:
            self._finish(job, JobState.failed, "failed", exc.code, str(exc), status=exc.status_code)
        except VerificationError as exc:
            log.error("verification failed for job %s: %s", job.id[:8], exc)
            self._finish(job, JobState.failed, "failed", "verification_failed",
                         "The protected output failed verification and was discarded.", status=500)
        except CorruptImageError as exc:
            self._finish(job, JobState.failed, "failed", exc.code, str(exc), status=exc.status_code)
        except MemoryError:
            log.error("out of memory for job %s", job.id[:8])
            self._finish(job, JobState.failed, "failed", "resource_exhausted",
                         "The image needed more memory than the server allows.", status=507)
        except Exception:  # noqa: BLE001 - internal details are logged, never returned
            log.exception("unexpected failure for job %s", job.id[:8])
            self._finish(job, JobState.failed, "failed", "internal_error",
                         "Processing failed on the server. Reference the job id when reporting.", status=500)

    def _timed_out(self, job: Job) -> bool:
        return getattr(job, "_timed_out", False)

    def _watch(self) -> None:
        """Set the cancel flag for jobs that exceed the processing timeout."""
        while not self._stop.wait(1.0):
            now = self._clock()
            with self._lock:
                running = [j for j in self._jobs.values() if j.state == JobState.running and j.started]
            for job in running:
                if now - job.started > self._timeout and not job.cancel_event.is_set():
                    setattr(job, "_timed_out", True)
                    job.cancel_event.set()
            self.sweep()

    def progress_callback(self, job: Job):
        """Return a function the engine can call to publish stage and progress."""
        def report(stage: str, fraction: float) -> None:
            job.stage = stage
            job.progress = max(0.0, min(1.0, fraction))
        return report
