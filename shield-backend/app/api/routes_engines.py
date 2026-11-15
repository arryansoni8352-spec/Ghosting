"""Protection endpoints.

POST /engines/{engine}/jobs     start a job (202). Recommended.
POST /engines/{engine}/protect  start a job and wait for it up to the sync wait limit (200).
                                If the job is still running, returns 202 with the job id.

The uploaded file is validated from its bytes before any work is queued. The client MIME type
is ignored for format decisions.
"""
from __future__ import annotations

import base64
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.config.settings import get_settings
from app.core.errors import (
    BudgetUnsatisfiableError, EngineNotImplementedError, InvalidOptionError, ModelUnavailableError, UnsupportedImageError,
)
from app.core.jobs import JobState
from app.core.registry import get_engine
from app.core.security import PROTECTED
from app.engines.style_shield.engine import Control
from app.schemas.protect import JobCreated, OutputFormat, ProtectOptions, Strength
from app.utils import images
from app.utils.uploads import read_bounded

router = APIRouter(prefix="/engines", tags=["protection"])


def _manager(request: Request):
    return request.app.state.jobs


def _validate_options(strength, output_format, quality, seed, max_steps, webp_lossless=False) -> ProtectOptions:
    try:
        return ProtectOptions(strength=strength, output_format=output_format, quality=quality,
                              seed=seed, max_steps=max_steps, webp_lossless=webp_lossless)
    except ValidationError as exc:
        first = exc.errors()[0]
        field = ".".join(str(p) for p in first.get("loc", ())) or "options"
        raise InvalidOptionError(f"Invalid value for '{field}': {first.get('msg', 'invalid')}.")


async def _prepare(engine: str, file: UploadFile, request: Request, opts: ProtectOptions) -> bytes:
    impl = get_engine(engine)
    if not impl.implemented:
        raise EngineNotImplementedError(f"{impl.name.value} is not available yet.")
    settings = get_settings()
    data = await read_bounded(file, settings.max_upload_mb * 1024 * 1024)
    # Header-only validation: format by signature, dimensions before any pixel decoding.
    im = images.open_checked(data, max_pixels=settings.max_input_pixels, min_side=settings.min_side_px)
    if settings.image_input_policy == "lossless_only":
        if im.format == "JPEG":
            raise UnsupportedImageError(
                "JPEG uploads are not supported: Image Shield accepts PNG and lossless WebP only, "
                "because it can only guarantee its perturbation budget on lossless files.")
        if im.format == "WEBP" and not images.webp_is_lossless(data):
            raise UnsupportedImageError(
                "Lossy WebP uploads are not supported. Use PNG or lossless WebP.")
    has_alpha = im.mode in ("LA", "RGBA") or ("transparency" in im.info)
    if opts.output_format == OutputFormat.jpeg and has_alpha:
        raise InvalidOptionError(
            "This image has transparency, which JPEG cannot store. Choose png or webp.")
    _precheck_lossy_output(data, opts, settings)
    ensure_engine_ready(impl)
    return data


def _precheck_lossy_output(data: bytes, opts: ProtectOptions, settings) -> None:
    """Fail fast (422) when a lossy OUTPUT format cannot meet the preset's budget on this image,
    using the codec's own measured distortion, before any queueing or optimisation."""
    lossy = opts.output_format == OutputFormat.jpeg or (
        opts.output_format == OutputFormat.webp and not opts.webp_lossless)
    if not lossy:
        return
    from app.engines.style_shield import optimise as opt
    from app.engines.style_shield.budget import integer_budget, measure_codec_noise
    src = images.load(data, max_pixels=settings.max_input_pixels, min_side=settings.min_side_px)
    visible = (src.alpha > 0) if src.has_alpha else None
    m = integer_budget(opt.PRESETS[opts.strength.value].epsilon)
    noise = measure_codec_noise(src, opts.output_format.value, opts.quality, lossless=False, visible_mask=visible)
    if noise > m:
        raise BudgetUnsatisfiableError(
            f"The {opts.output_format.value} codec alone changes pixels by up to {noise} of 255 levels at "
            f"quality {opts.quality}, over the '{opts.strength.value}' preset's {m}-level budget. "
            "Choose png or lossless webp.")


def ensure_engine_ready(impl) -> None:
    """Refuse honestly, before queueing, if the engine cannot run (e.g. no verified weights)."""
    check = getattr(impl, "readiness", None)
    if check is None:
        return
    status = check()
    if not status["ready"]:
        raise ModelUnavailableError(status["message"])


def _make_work(engine_name: str, opts: ProtectOptions):
    impl = get_engine(engine_name)

    def work(job, data: bytes) -> dict:
        settings = get_settings()
        src = images.load(data, max_pixels=settings.max_input_pixels, min_side=settings.min_side_px)
        control = Control(should_stop=job.cancel_event.is_set,
                          progress=_progress(job))
        res = impl.run(src, opts.strength.value, out_format=opts.output_format.value,
                       quality=opts.quality if opts.output_format != OutputFormat.png else None,
                       seed=opts.seed, max_steps=opts.max_steps, control=control,
                       input_bytes_len=len(data), webp_lossless=opts.webp_lossless)
        return {"output_bytes": res.encoded, "mime": res.mime, "extension": res.extension,
                "filename": f"protected-{job.id[:8]}{res.extension}", "record": res.record}
    return work


def _progress(job):
    def report(stage: str, fraction: float) -> None:
        job.stage = stage
        job.progress = max(0.0, min(1.0, fraction))
    return report


def _links(job_id: str, engine: str) -> dict:
    base = f"/engines/{engine}"
    return {"status_url": f"/jobs/{job_id}", "record_url": f"/jobs/{job_id}/record",
            "output_url": f"/jobs/{job_id}/output"}


@router.post("/{engine}/jobs", status_code=202, response_model=JobCreated, dependencies=PROTECTED)
async def create_job(
    engine: str,
    request: Request,
    file: UploadFile = File(...),
    strength: Strength = Form(Strength.balanced),
    output_format: OutputFormat = Form(OutputFormat.png),
    quality: int = Form(92),
    seed: int = Form(0),
    max_steps: Optional[int] = Form(None),
    webp_lossless: bool = Form(False),
):
    opts = _validate_options(strength, output_format, quality, seed, max_steps, webp_lossless)
    data = await _prepare(engine, file, request, opts)
    job = _manager(request).submit(engine, data, opts.model_dump(mode="json"), _make_work(engine, opts))
    return JSONResponse(status_code=202, content={"job_id": job.id, "owner_token": _issue_token(job),
                                                  "state": job.state.value, **_links(job.id, engine)})


def _issue_token(job) -> str:
    token, job.issued_token = job.issued_token, None     # shown once, then forgotten
    return token


@router.post("/{engine}/protect", dependencies=PROTECTED)
async def protect_and_wait(
    engine: str,
    request: Request,
    file: UploadFile = File(...),
    strength: Strength = Form(Strength.balanced),
    output_format: OutputFormat = Form(OutputFormat.png),
    quality: int = Form(92),
    seed: int = Form(0),
    max_steps: Optional[int] = Form(None),
    webp_lossless: bool = Form(False),
):
    import asyncio
    opts = _validate_options(strength, output_format, quality, seed, max_steps, webp_lossless)
    data = await _prepare(engine, file, request, opts)
    manager = _manager(request)
    job = manager.submit(engine, data, opts.model_dump(mode="json"), _make_work(engine, opts))
    wait = get_settings().sync_wait_seconds
    try:
        await asyncio.wait_for(asyncio.wrap_future(job.future), timeout=wait)
    except asyncio.TimeoutError:
        return JSONResponse(status_code=202, content={"job_id": job.id, "owner_token": _issue_token(job),
                                                      "state": job.state.value, **_links(job.id, engine)})
    if job.state != JobState.succeeded:
        return JSONResponse(status_code=job.error_status,
                            content={"job_id": job.id, "error": job.error_code,
                                     "message": job.error_message})
    out_bytes = manager.output_path(job.id).read_bytes()
    return JSONResponse({
        "job_id": job.id,
        "owner_token": _issue_token(job),
        "image_base64": base64.b64encode(out_bytes).decode("ascii"),
        "mime": job.output_mime,
        "filename": job.output_filename,
        "record": job.record,
        **_links(job.id, engine),
    })
