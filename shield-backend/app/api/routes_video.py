"""Video Shield endpoints (experimental).

POST /video/jobs   upload a video, validate it, queue a job (202). Poll /jobs/{id}; download /jobs/{id}/output.

Validation happens from the file's bytes BEFORE queueing: container signature, ffprobe metadata,
codec, duration, resolution, frame rate, frame count and estimated temporary storage. The client MIME
type and file name are ignored. The job repeats the probe on the stored copy before processing.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.api.routes_engines import ensure_engine_ready
from app.config.settings import get_settings
from app.core.errors import (
    EngineNotFoundError, InvalidOptionError, UnsupportedVideoError, VideoError,
)
from app.core.registry import get_engine
from app.core.security import PROTECTED
from app.schemas.protect import Strength
from app.schemas.video import VideoProtectOptions
from app.utils.uploads import read_bounded
from app.video import pipeline, probe as probe_mod
from app.video.limits import VideoLimits
from app.video.protector import StyleShieldFrameProtector
from app.video.signature import sniff_video

log = logging.getLogger("ghosting_shield.video.api")
router = APIRouter(prefix="/video", tags=["video (experimental)"])


def _default_protector_factory(opts: VideoProtectOptions):
    return StyleShieldFrameProtector(get_engine("style_shield"), opts.strength.value, opts.seed, opts.max_steps)


@router.post("/jobs", status_code=202, dependencies=PROTECTED)
async def create_video_job(
    request: Request,
    file: UploadFile = File(...),
    strength: Strength = Form(Strength.balanced),
    output_profile: str = Form("compatible"),
    temporal_mode: str = Form("static"),
    seed: int = Form(0),
    max_steps: Optional[int] = Form(None),
):
    settings = get_settings()
    if not settings.video_enabled:
        raise EngineNotFoundError("Video Shield is disabled on this server.")
    try:
        opts = VideoProtectOptions(strength=strength, output_profile=output_profile,
                                   temporal_mode=temporal_mode, seed=seed, max_steps=max_steps)
    except ValidationError as exc:
        first = exc.errors()[0]
        field = ".".join(str(p) for p in first.get("loc", ())) or "options"
        raise InvalidOptionError(f"Invalid value for '{field}': {first.get('msg', 'invalid')}.")
    limits = VideoLimits.from_settings(settings)
    data = await read_bounded(file, limits.max_upload_bytes)
    container = sniff_video(data)
    if container is None:
        raise UnsupportedVideoError("Only MP4/MOV (H.264) and WebM (VP8/VP9) videos are accepted.")
    manager = request.app.state.jobs
    info = await run_in_threadpool(probe_mod.probe_bytes, data, container, limits, manager.root / "_probe")
    probe_mod.validate(info, limits)

    factory = getattr(request.app.state, "video_protector_factory", None)
    if factory is None:
        ensure_engine_ready(get_engine("style_shield"))
        factory = _default_protector_factory

    def work(job, payload: bytes) -> dict:
        s = get_settings()
        lim = VideoLimits.from_settings(s)
        control = pipeline.Control(should_stop=job.cancel_event.is_set,
                                   progress=_progress(job))
        return pipeline.run_pipeline(
            data=payload, container=container, workdir=manager.workdir(job), limits=lim,
            options=pipeline.VideoOptions(strength=opts.strength.value, output_profile=opts.output_profile,
                                          temporal_mode=opts.temporal_mode, seed=opts.seed,
                                          max_steps=opts.max_steps),
            protector=factory(opts), control=control, job_label=job.id[:8])

    job = manager.submit("video_shield", data, opts.model_dump(mode="json"), work, kind="video")
    token, job.issued_token = job.issued_token, None
    return JSONResponse(status_code=202, content={
        "job_id": job.id, "owner_token": token, "state": job.state.value,
        "status_url": f"/jobs/{job.id}", "record_url": f"/jobs/{job.id}/record",
        "output_url": f"/jobs/{job.id}/output", "input": info.public()})


def _progress(job):
    def report(stage: str, fraction: float) -> None:
        job.stage = stage
        job.progress = max(0.0, min(1.0, fraction))
    return report
