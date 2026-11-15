"""Video limits, taken from settings so operators can tune them per host."""
from __future__ import annotations

from dataclasses import dataclass

from app.config.settings import Settings

ALLOWED_VIDEO_CODECS = {"h264", "vp8", "vp9"}
ALLOWED_AUDIO_CODECS = {"aac", "mp3", "opus", "vorbis", "ac3", "flac", "pcm_s16le"}
# Audio codecs MP4 can carry without re-encoding (opus-in-mp4 is not universally playable).
MP4_AUDIO_COPY_OK = {"aac", "mp3", "ac3"}
MKV_AUDIO_COPY_OK = ALLOWED_AUDIO_CODECS


@dataclass(frozen=True)
class VideoLimits:
    max_upload_bytes: int
    max_duration_s: float
    max_pixels: int
    max_fps: float
    max_frames: int
    max_keyframes: int
    max_temp_bytes: int
    ffmpeg_timeout_s: int
    ffmpeg_path: str
    ffprobe_path: str

    @classmethod
    def from_settings(cls, s: Settings) -> "VideoLimits":
        return cls(
            max_upload_bytes=s.video_max_upload_mb * 1024 * 1024,
            max_duration_s=s.video_max_duration_s,
            max_pixels=s.video_max_pixels,
            max_fps=s.video_max_fps,
            max_frames=s.video_max_frames,
            max_keyframes=s.video_max_keyframes,
            max_temp_bytes=s.video_max_temp_mb * 1024 * 1024,
            ffmpeg_timeout_s=s.video_ffmpeg_timeout_s,
            ffmpeg_path=s.ffmpeg_path,
            ffprobe_path=s.ffprobe_path,
        )
