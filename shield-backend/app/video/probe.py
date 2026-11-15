"""ffprobe wrapper and upload validation for Video Shield.

`probe()` reports what the file actually contains. `validate()` applies the operator's limits and
the supported-format list, and decides how variable frame rate and rotation are handled:

- Frame rate: the stream's average rate is used as a constant output rate. Variable-frame-rate
  input is detected (r_frame_rate != avg_frame_rate) and flagged; it is converted to constant
  frame rate, which can drop or duplicate frames. This is recorded in the job record.
- Rotation: display-matrix rotation is applied to the pixels during extraction, so the output has
  upright pixels and no rotation tag. Limits are checked against the rotated dimensions.
- Only the first audio stream is preserved; additional audio, subtitle and data streams are dropped.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path

from app.core.errors import (
    UnsupportedVideoError, VideoCorruptError, VideoLimitError, VideoProcessingError,
)
from app.video import ffmpeg
from app.video.limits import ALLOWED_AUDIO_CODECS, ALLOWED_VIDEO_CODECS, VideoLimits
from app.video.signature import DEMUXER


@dataclass
class AudioInfo:
    codec: str
    start_time: float
    duration: float | None
    channels: int | None
    sample_rate: int | None


@dataclass
class VideoInfo:
    container: str                 # 'mp4' | 'webm' (by signature)
    codec: str
    width: int                     # as stored
    height: int
    rotation: int                  # degrees clockwise to apply for display: 0, 90, 180, 270
    fps: Fraction                  # constant rate used for the output
    is_vfr: bool
    duration: float
    start_time: float
    pix_fmt: str
    color_space: str | None
    estimated_frames: int
    audio: AudioInfo | None
    extra_audio_streams: int = 0
    notes: list[str] = field(default_factory=list)

    @property
    def display_size(self) -> tuple[int, int]:
        w, h = self.width, self.height
        return (h, w) if self.rotation in (90, 270) else (w, h)

    def public(self) -> dict:
        w, h = self.display_size
        return {
            "container": self.container, "video_codec": self.codec, "width": w, "height": h,
            "rotation_applied": self.rotation, "frame_rate": float(self.fps),
            "variable_frame_rate": self.is_vfr, "duration_seconds": round(self.duration, 3),
            "estimated_frames": self.estimated_frames,
            "audio": ({"codec": self.audio.codec, "channels": self.audio.channels,
                       "sample_rate": self.audio.sample_rate} if self.audio else None),
            "notes": list(self.notes),
        }


def _frac(text: str | None) -> Fraction | None:
    if not text or "/" not in text:
        return None
    try:
        n, d = text.split("/", 1)
        f = Fraction(int(n), int(d))
    except (ValueError, ZeroDivisionError):
        return None
    return f if f > 0 else None


def _rotation(stream: dict) -> int:
    for sd in stream.get("side_data_list", []) or []:
        if "rotation" in sd:
            try:
                return int(round(-float(sd["rotation"]))) % 360 // 90 * 90   # ffprobe sign: CCW
            except (TypeError, ValueError):
                return 0
    tag = (stream.get("tags") or {}).get("rotate")
    if tag is not None:
        try:
            return int(tag) % 360 // 90 * 90
        except ValueError:
            return 0
    return 0


def probe(path: Path, container: str, limits: VideoLimits, should_stop=lambda: False) -> VideoInfo:
    demuxer = DEMUXER[container]
    try:
        raw = ffmpeg.run([limits.ffprobe_path, "-v", "error", "-protocol_whitelist", "file",
                          "-f", demuxer, "-print_format", "json", "-show_format", "-show_streams",
                          "-i", str(path)],
                         timeout_s=min(limits.ffmpeg_timeout_s, 60), should_stop=should_stop,
                         capture_stdout=True)
    except VideoProcessingError as exc:
        if exc.code == "video_step_failed":      # ffprobe ran but could not parse the file
            raise VideoCorruptError("The video could not be read. It may be corrupt or truncated.") from exc
        raise
    try:
        doc = json.loads(raw.decode("utf-8", "replace"))
    except json.JSONDecodeError as exc:
        raise VideoCorruptError("The video could not be read.") from exc
    streams = doc.get("streams") or []
    videos = [s for s in streams if s.get("codec_type") == "video"
              and not (s.get("disposition") or {}).get("attached_pic")]
    if not videos:
        raise VideoCorruptError("The file contains no video stream.")
    v = videos[0]
    audios = [s for s in streams if s.get("codec_type") == "audio"]
    notes: list[str] = []

    width, height = int(v.get("width") or 0), int(v.get("height") or 0)
    if width <= 0 or height <= 0:
        raise VideoCorruptError("The video has no valid dimensions.")
    avg, rate = _frac(v.get("avg_frame_rate")), _frac(v.get("r_frame_rate"))
    fps = avg or rate
    if fps is None:
        raise VideoCorruptError("The video frame rate could not be determined.")
    is_vfr = bool(avg and rate and abs(float(avg) - float(rate)) / float(rate) > 0.02)
    if is_vfr:
        notes.append("Variable frame rate detected; converted to a constant "
                     f"{float(fps):.3f} fps (frames may be dropped or duplicated).")
    fmt = doc.get("format") or {}
    try:
        duration = float(v.get("duration") or fmt.get("duration") or 0)
    except ValueError:
        duration = 0.0
    if duration <= 0:
        raise VideoCorruptError("The video duration could not be determined.")
    try:
        start = float(v.get("start_time") or fmt.get("start_time") or 0.0)
    except ValueError:
        start = 0.0
    audio = None
    if audios:
        a = audios[0]
        try:
            a_start = float(a.get("start_time") or 0.0)
        except ValueError:
            a_start = 0.0
        try:
            a_dur = float(a["duration"]) if a.get("duration") not in (None, "N/A") else None
        except ValueError:
            a_dur = None
        audio = AudioInfo(codec=str(a.get("codec_name")), start_time=a_start, duration=a_dur,
                          channels=int(a["channels"]) if a.get("channels") else None,
                          sample_rate=int(a["sample_rate"]) if a.get("sample_rate") else None)
    if len(audios) > 1:
        notes.append(f"{len(audios) - 1} additional audio stream(s) will be dropped.")
    return VideoInfo(
        container=container, codec=str(v.get("codec_name")), width=width, height=height,
        rotation=_rotation(v), fps=fps, is_vfr=is_vfr, duration=duration, start_time=start,
        pix_fmt=str(v.get("pix_fmt") or ""), color_space=v.get("color_space"),
        estimated_frames=max(1, int(round(duration * float(fps)))), audio=audio,
        extra_audio_streams=max(0, len(audios) - 1), notes=notes)


def validate(info: VideoInfo, limits: VideoLimits) -> None:
    """Raise a client-safe error if the video is unsupported or over a limit."""
    if info.codec not in ALLOWED_VIDEO_CODECS:
        raise UnsupportedVideoError(
            f"Video codec '{info.codec}' is not supported. Supported: "
            + ", ".join(sorted(ALLOWED_VIDEO_CODECS)) + ".")
    if info.audio and info.audio.codec not in ALLOWED_AUDIO_CODECS:
        raise UnsupportedVideoError(
            f"Audio codec '{info.audio.codec}' is not supported. Supported: "
            + ", ".join(sorted(ALLOWED_AUDIO_CODECS)) + ".")
    w, h = info.display_size
    if w * h > limits.max_pixels:
        raise VideoLimitError(
            f"The video is {w}x{h} ({w * h} pixels per frame). The limit is {limits.max_pixels} pixels.")
    if w < 32 or h < 32:
        raise UnsupportedVideoError("The video must be at least 32 px on each side.")
    if float(info.fps) > limits.max_fps:
        raise VideoLimitError(f"The frame rate is {float(info.fps):.1f} fps. The limit is {limits.max_fps:g} fps.")
    if info.duration > limits.max_duration_s:
        raise VideoLimitError(f"The video is {info.duration:.1f} s long. The limit is {limits.max_duration_s:g} s.")
    if info.estimated_frames > limits.max_frames:
        raise VideoLimitError(f"The video has about {info.estimated_frames} frames. The limit is {limits.max_frames}.")
    raw_bytes = info.estimated_frames * w * h * 3
    if raw_bytes > limits.max_temp_bytes:
        raise VideoLimitError("The video would need more temporary storage than the server allows.")


def probe_bytes(data: bytes, container: str, limits: VideoLimits, tmp_root: Path,
                should_stop=lambda: False) -> VideoInfo:
    """Probe an in-memory upload using a private, immediately-removed temporary file."""
    import shutil
    import tempfile
    tmp_root.mkdir(parents=True, exist_ok=True)
    d = Path(tempfile.mkdtemp(prefix="probe-", dir=tmp_root))
    try:
        p = d / "input.bin"
        p.write_bytes(data)
        return probe(p, container, limits, should_stop)
    finally:
        shutil.rmtree(d, ignore_errors=True)
