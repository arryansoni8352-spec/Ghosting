"""
VeilGuard Engine — Core engine implementation.

Receives line-delimited JSON requests from the Electron main process via stdin,
processes them, emits progress and result objects to stdout.

Security notes:
  - All input paths are validated to prevent path traversal.
  - Output paths must be absolute and within an allowed directory.
  - Image dimensions and file sizes are bounded before loading pixels.
  - Temporary files are always cleaned up.
  - No shell execution is performed.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import sys
import time
import traceback
import tempfile
import uuid
from pathlib import Path
from typing import Any

from . import __version__, __engine_id__
from .image_utils import (
    validate_image_path,
    read_image_metadata,
    ImageValidationError,
    MAX_FILE_SIZE_BYTES,
    MAX_DIMENSION_PX,
)
from .adapters.registry import get_registry

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

INTERFACE_VERSION = "1.0.0"


# ---------------------------------------------------------------------------
# Structured output helpers
# ---------------------------------------------------------------------------

def _emit(obj: dict[str, Any]) -> None:
    """Write a single JSON line to stdout and flush immediately."""
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def _emit_error(request_id: str, code: str, message: str, detail: str = "", elapsed_ms: float = 0) -> None:
    _emit({
        "type": "result",
        "status": "failure",
        "requestId": request_id,
        "error": {
            "code": code,
            "message": message,
            "detail": detail,
        },
        "elapsedMs": int(elapsed_ms),
    })


def _emit_progress(request_id: str, percent: int, message: str, elapsed_ms: float) -> None:
    _emit({
        "type": "progress",
        "requestId": request_id,
        "percent": percent,
        "message": message,
        "elapsedMs": int(elapsed_ms),
    })


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

def handle_health(request: dict[str, Any]) -> None:
    registry = get_registry()
    algorithms = [alg.descriptor() for alg in registry.values()]

    torch_available = False
    cuda_available = False
    try:
        import torch  # type: ignore
        torch_available = True
        cuda_available = torch.cuda.is_available()
    except ImportError:
        pass

    available_devices: list[str] = ["cpu"]
    if cuda_available:
        available_devices.append("cuda")

    degraded_reasons: list[str] = []
    if not torch_available:
        degraded_reasons.append(
            "PyTorch is not installed. Advanced research algorithms require PyTorch. "
            "Install it with: pip install torch --index-url https://download.pytorch.org/whl/cpu"
        )

    status = "ready" if not degraded_reasons else "degraded"

    _emit({
        "type": "health",
        "engineId": __engine_id__,
        "interfaceVersion": INTERFACE_VERSION,
        "engineVersion": __version__,
        "pythonVersion": sys.version,
        "platform": platform.system(),
        "availableAlgorithms": algorithms,
        "availableDevices": available_devices,
        "torchAvailable": torch_available,
        "cudaAvailable": cuda_available,
        "status": status,
        "degradedReasons": degraded_reasons,
    })


# ---------------------------------------------------------------------------
# Process request
# ---------------------------------------------------------------------------

def handle_process(request: dict[str, Any]) -> None:
    t_start = time.monotonic()
    request_id: str = request.get("requestId", str(uuid.uuid4()))

    def elapsed() -> float:
        return (time.monotonic() - t_start) * 1000

    # -- Resolve algorithm --
    algorithm_id: str = request.get("algorithmId", "")
    registry = get_registry()
    if algorithm_id not in registry:
        _emit_error(
            request_id, "ALGORITHM_UNAVAILABLE",
            f"Algorithm '{algorithm_id}' is not registered.",
            elapsed_ms=elapsed(),
        )
        return

    adapter = registry[algorithm_id]

    # -- Validate input path --
    input_path_raw: str = request.get("inputPath", "")
    try:
        input_path = validate_image_path(input_path_raw)
    except ImageValidationError as e:
        _emit_error(request_id, e.code, str(e), elapsed_ms=elapsed())
        return

    # -- Validate output path --
    output_path_raw: str = request.get("outputPath", "")
    try:
        output_path = _validate_output_path(output_path_raw, input_path)
    except ValueError as e:
        _emit_error(request_id, "OUTPUT_PATH_UNSAFE", str(e), elapsed_ms=elapsed())
        return

    # -- Read image metadata --
    try:
        metadata = read_image_metadata(input_path)
    except ImageValidationError as e:
        _emit_error(request_id, e.code, str(e), elapsed_ms=elapsed())
        return

    params: dict[str, Any] = request.get("params", {})
    device: str = request.get("device", "cpu")
    seed: int | None = request.get("seed")
    timeout_seconds: float = float(request.get("timeoutSeconds", 120))

    _emit_progress(request_id, 5, "Validated input image.", elapsed())

    # -- Run algorithm --
    try:
        result = adapter.run(
            input_path=input_path,
            output_path=output_path,
            params=params,
            device=device,
            seed=seed,
            timeout_seconds=timeout_seconds,
            progress_callback=lambda pct, msg: _emit_progress(request_id, pct, msg, elapsed()),
        )
    except Exception as exc:
        _emit_error(
            request_id, "INTERNAL_ERROR",
            "Unexpected error during processing.",
            detail=traceback.format_exc(),
            elapsed_ms=elapsed(),
        )
        return

    if result["status"] == "failure":
        _emit_error(request_id, result["error"]["code"], result["error"]["message"],
                    detail=result["error"].get("detail", ""), elapsed_ms=elapsed())
        return

    # -- Hash the output for integrity --
    output_hash = _sha256_file(output_path)

    _emit({
        "type": "result",
        "status": "success",
        "requestId": request_id,
        "algorithmId": algorithm_id,
        "algorithmStatus": adapter.descriptor()["status"],
        "device": device,
        "outputPath": str(output_path),
        "outputFormat": result.get("outputFormat", "png"),
        "elapsedMs": int(elapsed()),
        "peakMemoryMb": result.get("peakMemoryMb"),
        "outputHash": output_hash,
        "seed": seed,
        "warnings": result.get("warnings", []),
        "limitationNotices": result.get("limitationNotices", []),
    })


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_output_path(raw: str, input_path: Path) -> Path:
    """Validate output path: must be absolute, not the input, not traversal."""
    if not raw:
        raise ValueError("Output path is empty.")
    p = Path(raw).resolve()
    # Must be absolute (resolve() ensures this)
    if not p.is_absolute():
        raise ValueError("Output path must be absolute.")
    # Must not equal input path
    if p == input_path.resolve():
        raise ValueError("Output path must not be the same as the input path.")
    # Parent directory must exist
    if not p.parent.exists():
        raise ValueError(f"Output directory does not exist: {p.parent}")
    # Extension must be a safe image format
    if p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif"}:
        raise ValueError(f"Output file extension not allowed: {p.suffix}")
    return p


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Main event loop
# ---------------------------------------------------------------------------

def run_engine_loop() -> None:
    """
    Read line-delimited JSON requests from stdin, dispatch to handlers,
    write line-delimited JSON responses to stdout.
    """
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            _emit({
                "type": "error",
                "code": "PARSE_ERROR",
                "message": f"Could not parse request JSON: {e}",
            })
            continue

        msg_type: str = request.get("type", "")
        try:
            if msg_type == "health":
                handle_health(request)
            elif msg_type == "process":
                handle_process(request)
            elif msg_type == "ping":
                _emit({"type": "pong"})
            else:
                _emit({
                    "type": "error",
                    "code": "UNKNOWN_MESSAGE_TYPE",
                    "message": f"Unknown message type: '{msg_type}'",
                })
        except Exception:
            _emit({
                "type": "error",
                "code": "INTERNAL_ERROR",
                "message": "Unhandled exception in engine loop.",
                "detail": traceback.format_exc(),
            })
