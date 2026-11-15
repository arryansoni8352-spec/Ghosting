"""Container identification from file bytes. The client's MIME type and filename are ignored.

Supported containers (initial, deliberately small set):
- 'mp4'  : ISO base media (MP4 / MOV), recognised by an `ftyp` box.
- 'webm' : Matroska/WebM, recognised by the EBML magic number.

The returned name is also the demuxer forced for ffprobe/ffmpeg, so a crafted file cannot make
ffmpeg pick a more exotic demuxer (HLS playlists, concat lists, image sequences, ...).
"""
from __future__ import annotations

DEMUXER = {"mp4": "mov", "webm": "matroska"}
EXTENSION = {"mp4": ".mp4", "webm": ".webm"}


def sniff_video(data: bytes) -> str | None:
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return "mp4"
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"
    return None
