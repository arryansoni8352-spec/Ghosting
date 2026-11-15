from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.errors import ShieldError


async def shield_error_handler(_: Request, exc: ShieldError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code,
                        content={"error": exc.code, "message": str(exc)})
