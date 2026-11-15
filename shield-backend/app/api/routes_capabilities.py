"""GET /capabilities: what this server can actually do right now, with its limits and disclosures.

The website renders this verbatim: supported presets, formats, limits, readiness (are model weights
installed?), retention and logging statements. Nothing here is aspirational.
"""
from __future__ import annotations

import shutil

from fastapi import APIRouter, Request

from app import __version__
from app.config.settings import get_settings
from app.core.registry import get_engine
from app.video.limits import ALLOWED_AUDIO_CODECS, ALLOWED_VIDEO_CODECS, VideoLimits
from app.video.temporal import optical_flow_available

router = APIRouter(tags=["system"])

EXPERIMENTAL_NOTICE = "Experimental — protection effectiveness has not yet been independently validated."


def _tool_available(path: str) -> bool:
    return shutil.which(path) is not None


@router.get("/capabilities")
def capabilities(request: Request):
    from app.engines.style_shield import optimise as opt
    from app.engines.style_shield.budget import integer_budget
    s = get_settings()
    engine = get_engine("style_shield")
    ready = engine.readiness()
    limits = VideoLimits.from_settings(s)
    ffmpeg_ok = _tool_available(s.ffmpeg_path) and _tool_available(s.ffprobe_path)
    custom_video = getattr(request.app.state, "video_protector_factory", None) is not None
    video_ready = s.video_enabled and ffmpeg_ok and (ready["ready"] or custom_video)
    return {
        "service": {"name": "ghosting-shield", "version": __version__},
        "experimental_notice": EXPERIMENTAL_NOTICE,
        "access": {"auth_mode": s.auth_mode, "access_key_required": s.auth_mode == "api_key",
                   "job_token_header": "X-Job-Token", "access_key_header": "X-API-Key"},
        "image": {
            "engine": "style_shield", "ready": ready["ready"], "readiness": ready,
            "presets": [{"id": k, "epsilon": v.epsilon, "integer_budget_levels": integer_budget(v.epsilon),
                         "steps": v.steps} for k, v in opt.PRESETS.items()],
            "input_formats": (["png", "webp (lossless only)"] if s.image_input_policy == "lossless_only"
                              else ["png", "webp", "jpeg"]),
            "output_formats": ["png", "webp (lossless, webp_lossless=true)"],
            "lossy_outputs": "Accepted only when the encoded result is verified inside the budget; otherwise rejected (422).",
            "limits": {"max_upload_mb": s.max_upload_mb, "max_pixels": s.max_input_pixels,
                       "min_side_px": s.min_side_px},
        },
        "video": {
            "enabled": s.video_enabled, "ready": video_ready, "experimental": True,
            "ffmpeg_available": ffmpeg_ok, "optical_flow_available": optical_flow_available(),
            "containers": ["mp4/mov", "webm"], "video_codecs": sorted(ALLOWED_VIDEO_CODECS),
            "audio_codecs": sorted(ALLOWED_AUDIO_CODECS),
            "output_profiles": [
                {"id": "compatible", "container": "mp4", "codec": "h264", "lossless": False,
                 "note": "Plays everywhere. Lossy: the perturbation budget is measured after encoding and "
                         "usually NOT satisfied."},
                {"id": "lossless", "container": "mkv", "codec": "ffv1", "lossless": True,
                 "note": "Exact. Budget is verified on the decoded output. Large file; not previewable in browsers."}],
            "temporal_modes": [{"id": "static", "available": True, "default": True},
                               {"id": "flow", "available": optical_flow_available(), "default": False,
                                "note": "Experimental. On synthetic clips it rarely engages and did not reduce flicker."}],
            "limits": {"max_upload_mb": s.video_max_upload_mb, "max_duration_seconds": limits.max_duration_s,
                       "max_pixels": limits.max_pixels, "max_fps": limits.max_fps, "max_frames": limits.max_frames,
                       "max_protected_keyframes": limits.max_keyframes},
            "audio": "First audio stream is preserved (copied when the container allows, otherwise AAC). "
                     "Additional audio, subtitle and data streams are dropped.",
        },
        "retention": {
            "job_ttl_seconds": s.job_ttl_seconds,
            "statement": ("Uploaded files are held in server memory/temporary storage only while a job runs. "
                          "Results are kept for job_ttl_seconds after completion, then deleted automatically. "
                          "You can delete a job at any time."),
            "deletion": "DELETE /jobs/{job_id} with your job token.",
        },
        "logging": ("The application logs errors and job outcomes using a shortened job id. It does not log file "
                    "names, file contents or job tokens. Your hosting provider or proxy may log request metadata "
                    "such as IP addresses."),
        "third_party_services": [],
        "single_worker_notice": "Job state is in-process memory: run exactly one server process.",
    }
