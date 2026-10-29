"""
Image validation and metadata utilities for the VeilGuard engine.

Security rules enforced here:
  - File size bounded before opening
  - Dimensions bounded before loading pixels (decompression bomb protection)
  - File type verified by magic bytes, not extension alone
  - EXIF orientation read but never trusted for security-critical decisions
  - No shell commands used
"""

from __future__ import annotations

import os
import struct
from pathlib import Path
from typing import Any

# Resource limits
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_DIMENSION_PX = 8192  # 8192 × 8192 max
MAX_PIXEL_COUNT = 8192 * 8192

# Supported format magic bytes
_MAGIC = {
    b"\xff\xd8\xff": "jpeg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"RIFF": "webp",  # RIFF....WEBP — checked further below
    b"II*\x00": "tiff",
    b"MM\x00*": "tiff",
}


class ImageValidationError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def validate_image_path(raw: str) -> Path:
    """
    Return a resolved absolute Path to an image file, or raise ImageValidationError.
    Does NOT load pixel data.
    """
    if not raw:
        raise ImageValidationError("INPUT_NOT_FOUND", "No input path provided.")

    path = Path(raw).resolve()

    if not path.exists():
        raise ImageValidationError("INPUT_NOT_FOUND", f"File not found: {path}")

    if not path.is_file():
        raise ImageValidationError("INPUT_NOT_FOUND", f"Path is not a file: {path}")

    size = path.stat().st_size
    if size > MAX_FILE_SIZE_BYTES:
        raise ImageValidationError(
            "INPUT_TOO_LARGE",
            f"File size {size:,} bytes exceeds limit of {MAX_FILE_SIZE_BYTES:,} bytes.",
        )

    if size == 0:
        raise ImageValidationError("INPUT_MALFORMED", "File is empty.")

    # Verify format by magic bytes
    fmt = _detect_format(path)
    if fmt is None:
        raise ImageValidationError(
            "INPUT_FORMAT_UNSUPPORTED",
            "File format not recognised. Supported: JPEG, PNG, WebP, TIFF.",
        )

    return path


def _detect_format(path: Path) -> str | None:
    with open(path, "rb") as f:
        header = f.read(12)

    for magic, fmt in _MAGIC.items():
        if header[: len(magic)] == magic:
            if fmt == "webp":
                # Verify WEBP marker at bytes 8–12
                if header[8:12] == b"WEBP":
                    return "webp"
                return None  # RIFF but not WebP
            return fmt
    return None


def read_image_metadata(path: Path) -> dict[str, Any]:
    """
    Load image metadata including dimensions, EXIF orientation and alpha channel.
    Raises ImageValidationError on malformed files.
    Limits pixel count to prevent decompression bombs.
    """
    try:
        from PIL import Image, ExifTags  # type: ignore

        # PIL has its own decompression bomb check, ensure it's set conservatively
        Image.MAX_IMAGE_PIXELS = MAX_PIXEL_COUNT

        with Image.open(path) as img:
            width, height = img.size

            if width > MAX_DIMENSION_PX or height > MAX_DIMENSION_PX:
                raise ImageValidationError(
                    "INPUT_DIMENSIONS_EXCEEDED",
                    f"Image dimensions {width}×{height} exceed maximum {MAX_DIMENSION_PX}×{MAX_DIMENSION_PX}.",
                )

            if width * height > MAX_PIXEL_COUNT:
                raise ImageValidationError(
                    "INPUT_DIMENSIONS_EXCEEDED",
                    f"Total pixel count {width * height:,} exceeds limit {MAX_PIXEL_COUNT:,}.",
                )

            has_alpha = img.mode in ("RGBA", "LA", "PA") or (
                img.mode == "P" and "transparency" in img.info
            )

            exif_orientation: int | None = None
            has_exif = False
            try:
                exif_data = img.getexif()
                if exif_data:
                    has_exif = True
                    orientation_tag = next(
                        (k for k, v in ExifTags.TAGS.items() if v == "Orientation"), None
                    )
                    if orientation_tag:
                        exif_orientation = exif_data.get(orientation_tag)
            except Exception:
                pass

            fmt_map = {
                "JPEG": "jpeg",
                "PNG": "png",
                "WEBP": "webp",
                "TIFF": "tiff",
            }
            fmt = fmt_map.get(img.format or "", "jpeg")

            return {
                "path": str(path),
                "filename": path.name,
                "format": fmt,
                "widthPx": width,
                "heightPx": height,
                "fileSizeBytes": path.stat().st_size,
                "hasExif": has_exif,
                "exifOrientation": exif_orientation,
                "hasAlpha": has_alpha,
                "mode": img.mode,
            }

    except ImageValidationError:
        raise
    except Exception as exc:
        raise ImageValidationError("INPUT_MALFORMED", f"Could not read image: {exc}") from exc
