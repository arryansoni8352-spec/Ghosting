"""Format-safe image I/O for PNG, JPEG and WebP.

Principles
- The format is decided by the file's own bytes (magic numbers), never by the client's MIME type.
- Dimensions are checked from the file header BEFORE any pixel data is decoded.
- Modes are preserved: L stays grayscale, LA and RGBA keep their alpha channel, RGB stays RGB.
- Conversions that cannot be avoided are recorded in `Decoded.notes` and in the job record.

Documented, format-specific behaviour
- WebP has no grayscale mode. L and LA inputs are written as RGB/RGBA with equal channels.
- JPEG has no alpha channel. RGBA/LA input with JPEG output is refused (InvalidOptionError).
- EXIF orientation is applied to the pixels. EXIF and ICC metadata are not copied to the output.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageOps

from app.core.errors import (
    CorruptImageError, FormatMismatchError, ImageTooLargeError, InvalidOptionError,
    UnsupportedImageError, VerificationError,
)

# Pillow's global guard. Our own dimension check runs first; this is a second line of defence.
Image.MAX_IMAGE_PIXELS = 64_000_000

PNG_SIG = b"\x89PNG\r\n\x1a\n"
FORMAT_INFO = {
    # format: (output id, MIME type, file extension)
    "PNG": ("png", "image/png", ".png"),
    "JPEG": ("jpeg", "image/jpeg", ".jpg"),
    "WEBP": ("webp", "image/webp", ".webp"),
}
OUTPUT_FORMATS = {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}


def sniff(data: bytes) -> str | None:
    """Return the format named by the file's magic bytes, or None."""
    if data[:8] == PNG_SIG:
        return "PNG"
    if data[:3] == b"\xff\xd8\xff":
        return "JPEG"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "WEBP"
    return None


def webp_is_lossless(data: bytes) -> bool:
    """True only if the WebP image data is a VP8L (lossless) bitstream. Walks the RIFF chunks."""
    pos, n = 12, len(data)
    while pos + 8 <= n:
        fourcc = data[pos:pos + 4]
        size = int.from_bytes(data[pos + 4:pos + 8], "little")
        if fourcc == b"VP8L":
            return True
        if fourcc == b"VP8 ":
            return False
        pos += 8 + size + (size & 1)
    return False


def open_checked(data: bytes, max_pixels: int, min_side: int) -> Image.Image:
    """Validate a file from its header only. Does NOT decode pixel data."""
    declared = sniff(data)
    if declared is None:
        raise UnsupportedImageError("Only PNG, JPEG and WebP images are accepted.")
    try:
        im = Image.open(io.BytesIO(data))
    except Image.DecompressionBombError as exc:
        raise ImageTooLargeError("The image dimensions are too large to process.") from exc
    except Exception as exc:  # noqa: BLE001 - any parse failure is a client error
        raise CorruptImageError("The file could not be read as an image.") from exc
    if im.format != declared:
        raise FormatMismatchError(f"File content is {im.format}, which does not match its signature.")
    w, h = im.size
    if w <= 0 or h <= 0:
        raise CorruptImageError("The image has no pixels.")
    if w * h > max_pixels:
        raise ImageTooLargeError(
            f"The image is {w}x{h} ({w * h} pixels). The limit is {max_pixels} pixels.")
    if min(w, h) < min_side:
        raise UnsupportedImageError(f"The image must be at least {min_side} px on each side.")
    if getattr(im, "n_frames", 1) > 1:
        raise UnsupportedImageError("Animated images are not supported.")
    return im


@dataclass
class Decoded:
    mode: str                        # 'L' | 'LA' | 'RGB' | 'RGBA'
    pixels: np.ndarray               # H x W (L, LA) or H x W x 3 (RGB, RGBA); uint8
    alpha: np.ndarray | None         # H x W uint8 for LA and RGBA
    source_format: str
    source_mode: str
    notes: list[str] = field(default_factory=list)

    @property
    def size(self) -> tuple[int, int]:
        return (self.pixels.shape[1], self.pixels.shape[0])

    @property
    def has_alpha(self) -> bool:
        return self.alpha is not None

    @property
    def is_grayscale(self) -> bool:
        return self.mode in ("L", "LA")


def decode(im: Image.Image, source_format: str) -> Decoded:
    """Decode a validated image into a canonical mode with alpha kept separate."""
    notes: list[str] = []
    source_mode = im.mode
    try:
        im = ImageOps.exif_transpose(im)
        if im.mode in ("I;16", "I;16B", "I;16L", "I", "F", "1"):
            notes.append(f"converted from {im.mode} to 8-bit grayscale")
            im = im.convert("L")
        elif im.mode == "P":
            if "transparency" in im.info:
                im = im.convert("RGBA")
                notes.append("palette image with transparency converted to RGBA")
            else:
                im = im.convert("RGB")
                notes.append("palette image converted to RGB")
        elif im.mode not in ("L", "LA", "RGB", "RGBA"):
            if "A" in im.mode:
                im = im.convert("RGBA")
                notes.append(f"converted from {im.mode} to RGBA")
            else:
                im = im.convert("RGB")
                notes.append(f"converted from {source_mode} to RGB")
        arr = np.asarray(im, dtype=np.uint8).copy()
    except Exception as exc:  # noqa: BLE001
        raise CorruptImageError("The image pixels could not be decoded.") from exc

    if im.mode == "L":
        return Decoded("L", arr, None, source_format, source_mode, notes)
    if im.mode == "LA":
        return Decoded("LA", arr[..., 0].copy(), arr[..., 1].copy(), source_format, source_mode, notes)
    if im.mode == "RGB":
        return Decoded("RGB", arr, None, source_format, source_mode, notes)
    return Decoded("RGBA", arr[..., :3].copy(), arr[..., 3].copy(), source_format, source_mode, notes)


def load(data: bytes, max_pixels: int, min_side: int) -> Decoded:
    """Validate, then decode. The only entry point for untrusted input."""
    im = open_checked(data, max_pixels, min_side)
    return decode(im, sniff(data))


def _to_pil(d_mode: str, pixels: np.ndarray, alpha: np.ndarray | None) -> Image.Image:
    if d_mode == "L":
        return Image.fromarray(pixels, "L")
    if d_mode == "LA":
        return Image.fromarray(np.dstack([pixels, alpha]), "LA")
    if d_mode == "RGB":
        return Image.fromarray(pixels, "RGB")
    return Image.fromarray(np.dstack([pixels, alpha]), "RGBA")


def encode(d_mode: str, pixels: np.ndarray, alpha: np.ndarray | None, out_format: str,
           quality: int | None = None, lossless: bool = False) -> bytes:
    """Encode canonical pixels to PNG, JPEG or WebP bytes.

    `lossless` only applies to WebP (Pillow supports lossless WEBP); it gives WebP the same
    exact-budget guarantee as PNG, at a larger file size. Ignored for PNG (always lossless) and
    invalid for JPEG (JPEG has no lossless mode).
    """
    if out_format not in OUTPUT_FORMATS:
        raise InvalidOptionError(f"Unsupported output format '{out_format}'. Use png, jpeg or webp.")
    fmt = OUTPUT_FORMATS[out_format]
    if fmt == "JPEG" and d_mode in ("LA", "RGBA"):
        raise InvalidOptionError(
            "JPEG cannot store transparency. Choose png or webp to keep the alpha channel.")
    img = _to_pil(d_mode, pixels, alpha)
    buf = io.BytesIO()
    if fmt == "PNG":
        img.save(buf, format="PNG", compress_level=6)
    elif fmt == "JPEG":
        if quality is None or not 1 <= quality <= 100:
            raise InvalidOptionError("JPEG quality must be an integer from 1 to 100.")
        img.save(buf, format="JPEG", quality=quality)
    else:
        if lossless:
            img.save(buf, format="WEBP", lossless=True, method=6)
        else:
            if quality is None or not 1 <= quality <= 100:
                raise InvalidOptionError("WebP quality must be an integer from 1 to 100.")
            img.save(buf, format="WEBP", quality=quality, method=4, lossless=False)
    return buf.getvalue()


def expected_output_mode(d_mode: str, out_format: str) -> str:
    """The mode a correct decoder must see after encoding to out_format."""
    if out_format == "webp":
        return {"L": "RGB", "LA": "RGBA", "RGB": "RGB", "RGBA": "RGBA"}[d_mode]
    return d_mode


def verify_encoded(data: bytes, out_format: str, src: Decoded) -> Decoded:
    """Reopen the ENCODED bytes and decode them again. Raises VerificationError on any mismatch."""
    expected_fmt = OUTPUT_FORMATS[out_format]
    if sniff(data) != expected_fmt:
        raise VerificationError("encoded output does not carry the requested format signature")
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as exc:  # noqa: BLE001
        raise VerificationError("encoded output could not be reopened") from exc
    if im.format != expected_fmt:
        raise VerificationError("encoded output format differs from the request")
    out = decode(im, expected_fmt)
    if out.size != src.size:
        raise VerificationError(f"dimension changed: {src.size} -> {out.size}")
    want_mode = expected_output_mode(src.mode, out_format)
    if out.mode != want_mode:
        raise VerificationError(f"colour mode {out.mode} does not match expected {want_mode}")
    return out


# ---- legacy helpers used by the Phase 2 evaluation harness and its tests ----

def webp_supported() -> bool:
    from PIL import features
    return bool(features.check("webp"))


def decode_rgb(data: bytes) -> np.ndarray:
    """Evaluation helper: decode to RGB. Transparent pixels are composited onto WHITE.

    This is an evaluation convention only. It must NOT be used to produce protected output.
    """
    im = open_checked(data, max_pixels=64_000_000, min_side=1)
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, rgba).convert("RGB")
    else:
        im = im.convert("RGB")
    return np.asarray(im, dtype=np.uint8).copy()


def dimensions(data: bytes) -> tuple[int, int]:
    return ImageOps.exif_transpose(Image.open(io.BytesIO(data))).size


def encode_legacy(arr: np.ndarray, fmt: str, quality: int | None = None) -> bytes:
    """Evaluation helper kept for the Phase 2 tests. Not used by the protection pipeline."""
    key = fmt.lower()
    if key not in OUTPUT_FORMATS:
        raise ValueError(f"unsupported format '{fmt}'")
    if key == "webp" and not webp_supported():
        raise RuntimeError("this Pillow build has no WebP support")
    if key in ("jpeg", "webp") and (quality is None or not 1 <= quality <= 100):
        raise ValueError("lossy formats need quality in 1..100")
    img = Image.fromarray(np.asarray(arr, dtype=np.uint8))
    buf = io.BytesIO()
    kwargs = {}
    if key in ("jpeg", "webp"):
        kwargs["quality"] = quality
    if key == "webp":
        kwargs["method"] = 4
    img.save(buf, format=OUTPUT_FORMATS[key], **kwargs)
    return buf.getvalue()
