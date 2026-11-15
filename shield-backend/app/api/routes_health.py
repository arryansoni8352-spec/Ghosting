"""Health, version and capability reporting. Read-only: nothing here downloads or loads models."""
from fastapi import APIRouter, Request

from app import __version__
from app.config.settings import get_settings
from app.engines.style_shield.weights import MOBILENET_V1_NOTOP, weights_status

router = APIRouter(tags=["system"])


def backend_info() -> dict:
    """Describe the JAX backend that is actually active. CUDA packages alone do not count."""
    try:
        import jax
        import jaxlib
    except ImportError:
        return {"jax_installed": False, "active_backend": None, "devices": [], "gpu_available": False}
    devices = []
    for d in jax.devices():
        devices.append({"id": int(d.id), "platform": d.platform, "kind": getattr(d, "device_kind", "")})
    platforms = {d["platform"] for d in devices}
    gpu = bool(platforms & {"gpu", "cuda", "rocm"})
    return {
        "jax_installed": True,
        "jax_version": jax.__version__,
        "jaxlib_version": jaxlib.__version__,
        "active_backend": jax.default_backend(),
        "devices": devices,
        "cpu_available": "cpu" in platforms,
        "gpu_available": gpu,
    }


@router.get("/health")
def health(request: Request):
    settings = get_settings()
    info = backend_info()
    requested = settings.device
    notes = []
    if requested == "gpu" and not info.get("gpu_available"):
        notes.append("GPU requested but no GPU device is visible; processing uses the CPU backend.")
    jobs = getattr(request.app.state, "jobs", None)
    return {
        "status": "ok",
        "version": __version__,
        "compute": {"requested": requested, **info, "notes": notes},
        "models": [weights_status(MOBILENET_V1_NOTOP)],
        "security": {
            "auth_mode": settings.auth_mode,
            "production_mode": settings.production_mode,
            "rate_limit_per_minute": settings.rate_limit_per_minute,
        },
        "jobs": jobs.counts() if jobs else {},
    }


@router.get("/version")
def version():
    return {"service": "ghosting-shield", "version": __version__, "api": "v2",
            "engines": {"style_shield": "implemented", "face_shield": "not_implemented"}}
