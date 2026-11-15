"""Job status, output download, record retrieval and cancellation.

Job identifiers are 43-character URL-safe random strings. Every operation also requires the job's
owner token (X-Job-Token header), issued once when the job is created. An unknown, malformed or
foreign identifier, and a missing or wrong token, all return the same 404, so the API does not reveal
which jobs exist.
"""
from fastapi import APIRouter, Request, Response
from fastapi.responses import FileResponse, JSONResponse

from app.core.errors import JobNotReadyError
from app.core.jobs import JobState
from app.core.security import PROTECTED_READ, job_token

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", dependencies=PROTECTED_READ)
def job_status(job_id: str, request: Request):
    job = request.app.state.jobs.get(job_id, job_token(request))
    return JSONResponse(job.public_status())


@router.get("/{job_id}/record", dependencies=PROTECTED_READ)
def job_record(job_id: str, request: Request):
    job = request.app.state.jobs.get(job_id, job_token(request))
    if job.state != JobState.succeeded or job.record is None:
        raise JobNotReadyError("The protection record is available only after the job succeeds.")
    return JSONResponse(job.record)


@router.get("/{job_id}/output", dependencies=PROTECTED_READ)
def job_output(job_id: str, request: Request):
    manager = request.app.state.jobs
    token = job_token(request)
    job = manager.get(job_id, token)
    if job.state != JobState.succeeded:
        raise JobNotReadyError("The output is available only after the job succeeds.")
    path = manager.output_path(job_id, token)
    return FileResponse(path, media_type=job.output_mime, filename=job.output_filename,
                        headers={"Cache-Control": "no-store",
                                 "X-Content-Type-Options": "nosniff"})


@router.post("/{job_id}/cancel", status_code=202, dependencies=PROTECTED_READ)
def job_cancel(job_id: str, request: Request):
    job = request.app.state.jobs.cancel(job_id, job_token(request))
    return JSONResponse(status_code=202, content=job.public_status())


@router.delete("/{job_id}", status_code=204, dependencies=PROTECTED_READ)
def job_delete(job_id: str, request: Request):
    request.app.state.jobs.delete(job_id, job_token(request))
    return Response(status_code=204)
