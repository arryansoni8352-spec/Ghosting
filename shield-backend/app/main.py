"""GHOSTING Shield API. Run locally with:  uvicorn app.main:app --port 8080

Production deployments must set SHIELD_AUTH_MODE=api_key and SHIELD_PRODUCTION_MODE=true.
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.middleware import BodyLimitMiddleware, SecurityHeadersMiddleware
from app.api.routes_capabilities import router as capabilities_router
from app.api.routes_engines import router as engines_router
from app.api.routes_health import router as health_router
from app.api.routes_jobs import router as jobs_router
from app.api.routes_models import router as models_router
from app.api.routes_video import router as video_router
from app.config.settings import get_settings
from app.core.errors import ShieldError
from app.core.jobs import JobManager
from app.core.security import check_production_settings, reset_limiter

log = logging.getLogger("ghosting_shield")

_check_production = check_production_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    _check_production(settings)
    app.state.jobs = JobManager(
        max_workers=settings.max_concurrent_jobs,
        max_queued=settings.max_queued_jobs,
        timeout_s=settings.job_timeout_seconds,
        ttl_s=settings.job_ttl_seconds,
        root_dir=settings.job_dir or None,
    )
    try:
        yield
    finally:
        app.state.jobs.shutdown()


def _configure_logging(level: str) -> None:
    """Plain, single-line logs to stderr. Application code logs shortened job ids only; it never logs
    file names, file contents, owner tokens or access keys (verified by tests/api/test_logging_privacy.py)."""
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO),
                            format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("ghosting_shield").setLevel(getattr(logging, level.upper(), logging.INFO))


def create_app() -> FastAPI:
    settings = get_settings()
    _configure_logging(settings.log_level)
    reset_limiter()   # pick up the current SHIELD_RATE_LIMIT_PER_MINUTE rather than a stale value
    app = FastAPI(
        title="GHOSTING Shield",
        version=__version__,
        description=("Experimental adversarial image-protection service. Protection is not guaranteed "
                     "and is not verified against all models."),
        lifespan=lifespan,
    )
    app.add_middleware(BodyLimitMiddleware,
                       max_bytes=max(settings.max_upload_mb, settings.video_max_upload_mb if settings.video_enabled else 0)
                       * 1024 * 1024 + 64 * 1024)
    app.add_middleware(SecurityHeadersMiddleware)
    if settings.cors_origin_list:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list,
                           allow_methods=["GET", "POST", "DELETE"],
                           allow_headers=["Content-Type", "X-Job-Token", "X-API-Key"],
                           expose_headers=["Content-Disposition", "Retry-After"])

    @app.exception_handler(ShieldError)
    async def _shield_error(_: Request, exc: ShieldError):
        headers = {}
        if getattr(exc, "retry_after", None):
            headers["Retry-After"] = str(exc.retry_after)
        return JSONResponse(status_code=exc.status_code,
                            content={"error": exc.code, "message": str(exc)}, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(p) for p in first.get("loc", ()) if p not in ("body", "query"))
        return JSONResponse(status_code=422, content={
            "error": "invalid_request",
            "message": f"Invalid request field '{loc or 'input'}'."})

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        log.exception("unhandled error")
        return JSONResponse(status_code=500, content={
            "error": "internal_error", "message": "The server could not complete the request."})

    app.include_router(health_router)
    app.include_router(models_router)
    app.include_router(engines_router)
    app.include_router(video_router)
    app.include_router(capabilities_router)
    app.include_router(jobs_router)
    return app


app = create_app()
