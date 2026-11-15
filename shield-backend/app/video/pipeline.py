"""Video Shield pipeline: probe -> extract -> scenes -> keyframes -> propagate -> encode -> validate.

Every stage reports REAL progress (counted frames / completed keyframes), checks the cancel flag
between units of work, and runs ffmpeg through app.video.ffmpeg (list args, timeouts, killable).
The work directory is removed in `finally` whatever happens.

Output profiles
- "compatible": H.264 + yuv420p MP4 (WebM input audio is re-encoded to AAC when MP4 cannot carry
  it). Lossy: the perturbation budget is NOT guaranteed after encoding. It is measured on the
  decoded output and reported honestly (`budget_satisfied_after_encoding`).
- "lossless": FFV1 RGB in Matroska. Bit-exact for the protected frames, so the integer budget can be
  verified exactly. Large files; not playable in most browsers (no in-page preview).
"""
from __future__ import annotations

import logging
import os
import shutil
import time
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image

from app.core.errors import (
    JobCancelled, VideoCorruptError, VideoLimitError, VideoProcessingError, VideoValidationError,
)
from app.video import ffmpeg, probe as probe_mod, scenes, temporal
from app.video.limits import MKV_AUDIO_COPY_OK, MP4_AUDIO_COPY_OK, VideoLimits
from app.video.protector import FrameProtector
from app.video.signature import DEMUXER, EXTENSION

log = logging.getLogger("ghosting_shield.video")

# progress budget per stage (fractions of the whole job)
P_PROBE, P_EXTRACT, P_SCENES, P_KEYS, P_PROP, P_ENCODE, P_VALIDATE = 0.03, 0.15, 0.18, 0.70, 0.85, 0.93, 1.0

PROFILES = {
    "compatible": {"ext": ".mp4", "mime": "video/mp4", "container": "mp4"},
    "lossless": {"ext": ".mkv", "mime": "video/x-matroska", "container": "webm"},   # matroska demuxer
}
MODES = ("flow", "static")


@dataclass
class VideoOptions:
    strength: str = "balanced"
    output_profile: str = "compatible"
    temporal_mode: str = "static"
    seed: int = 0
    max_steps: int | None = None
    keyframe_interval: int | None = 24


@dataclass
class Control:
    should_stop: Callable[[], bool] = lambda: False
    progress: Callable[[str, float], None] = lambda stage, fraction: None


def _fps_arg(f: Fraction) -> str:
    return f"{f.numerator}/{f.denominator}"


def _matrix(info: probe_mod.VideoInfo) -> str:
    """Colour matrix used for BOTH extraction and re-encoding, so colours round-trip."""
    cs = (info.color_space or "").lower()
    if cs in ("bt709",):
        return "bt709"
    if cs in ("bt470bg", "smpte170m", "bt601"):
        return "bt601"
    return "bt709" if info.display_size[1] >= 720 else "bt601"


def _tags(matrix: str) -> list[str]:
    name = "bt709" if matrix == "bt709" else "smpte170m"
    return ["-colorspace", name, "-color_primaries", name, "-color_trc", name, "-color_range", "tv"]


def _frame_path(d: Path, i: int) -> Path:
    return d / f"{i:06d}.png"


def _read(path: Path) -> np.ndarray:
    with Image.open(path) as im:
        return np.asarray(im.convert("RGB"), dtype=np.uint8).copy()


def _write(path: Path, arr: np.ndarray) -> None:
    Image.fromarray(arr, "RGB").save(path, format="PNG", compress_level=1)


def _dir_bytes(d: Path) -> int:
    try:
        return sum(e.stat().st_size for e in os.scandir(d) if e.is_file())
    except FileNotFoundError:
        return 0


def _base(limits: VideoLimits) -> list[str]:
    return [limits.ffmpeg_path, "-nostdin", "-hide_banner", "-loglevel", "error", "-y"]


def run_pipeline(*, data: bytes, container: str, workdir: Path, limits: VideoLimits,
                 options: VideoOptions, protector: FrameProtector, control: Control | None = None,
                 job_label: str = "") -> dict:
    """Run the whole pipeline. Returns {'output_file','mime','extension','filename','record'}."""
    control = control or Control()
    t_start = time.perf_counter()
    if options.output_profile not in PROFILES:
        raise VideoProcessingError("Unknown output profile.", code="invalid_option", status_code=422)
    if options.temporal_mode not in MODES:
        raise VideoProcessingError("Unknown temporal mode.", code="invalid_option", status_code=422)
    work = Path(workdir)
    frames_dir, prot_dir, dec_dir = work / "frames", work / "protected", work / "decoded"
    try:
        for d in (frames_dir, prot_dir, dec_dir):
            d.mkdir(parents=True, exist_ok=True)
        src = work / "input.bin"
        src.write_bytes(data)
        stop = control.should_stop

        def check() -> None:
            if stop():
                raise JobCancelled()

        # ------------------------------------------------------------- probe
        control.progress("probing", 0.0)
        info = probe_mod.probe(src, container, limits, stop)
        probe_mod.validate(info, limits)
        check()
        control.progress("probing", P_PROBE)
        w, h = info.display_size
        matrix = _matrix(info)
        demux = DEMUXER[container]
        fps = info.fps

        # ----------------------------------------------------------- extract
        control.progress("extracting_frames", P_PROBE)
        est = max(1, info.estimated_frames)

        def poll_extract() -> None:
            n = sum(1 for _ in frames_dir.iterdir())
            control.progress("extracting_frames", P_PROBE + (P_EXTRACT - P_PROBE) * min(1.0, n / est))
            if _dir_bytes(frames_dir) > limits.max_temp_bytes:
                raise VideoLimitError("The video needs more temporary storage than the server allows.")

        ffmpeg.run(_base(limits) + [
            "-protocol_whitelist", "file", "-f", demux, "-i", str(src),
            "-map", "0:v:0", "-an", "-sn", "-dn",
            "-vf", f"setpts=PTS-STARTPTS,fps={_fps_arg(fps)},scale=in_color_matrix={matrix}:in_range=auto,format=rgb24",
            "-fps_mode", "passthrough", "-frames:v", str(limits.max_frames + 1),
            "-start_number", "0", str(frames_dir / "%06d.png")],
            timeout_s=limits.ffmpeg_timeout_s, should_stop=stop, on_poll=poll_extract)
        n_frames = sum(1 for _ in frames_dir.iterdir())
        if n_frames == 0:
            raise VideoCorruptError("No frames could be decoded from the video.")
        if n_frames > limits.max_frames:
            raise VideoLimitError(f"The video has more than {limits.max_frames} frames.")
        first = _read(_frame_path(frames_dir, 0))
        if first.shape[:2] != (h, w):
            raise VideoCorruptError("Decoded frame size does not match the video header.")
        control.progress("extracting_frames", P_EXTRACT)

        # ------------------------------------------------------------ scenes
        control.progress("detecting_scenes", P_EXTRACT)
        sigs = []
        for i in range(n_frames):
            check()
            sigs.append(scenes.signature(_read(_frame_path(frames_dir, i))))
        starts = scenes.scene_starts(sigs)
        del sigs
        segments, relaxed = temporal.plan_segments(n_frames, starts, options.keyframe_interval,
                                                   limits.max_keyframes)
        control.progress("detecting_scenes", P_SCENES)

        # --------------------------------------------------------- keyframes
        key_data: dict[int, tuple[np.ndarray, np.ndarray, np.ndarray]] = {}   # seg idx -> (frame, delta, gray)
        key_summaries = []
        K = len(segments)
        for si, seg in enumerate(segments):
            check()
            frame = _read(_frame_path(frames_dir, seg.key))

            class _C:   # engine control scaled into this keyframe's slice of the progress bar
                should_stop = staticmethod(stop)

                @staticmethod
                def progress(stage, fraction, _si=si):
                    control.progress(f"protecting_keyframe_{_si + 1}_of_{K}",
                                     P_SCENES + (P_KEYS - P_SCENES) * ((_si + max(0.0, min(1.0, fraction))) / K))
            protected, summary = protector.protect(frame, _C, seg.key)
            if protected.shape != frame.shape or protected.dtype != np.uint8:
                raise VideoValidationError("The protection step returned an invalid frame.")
            delta = protected.astype(np.int16) - frame.astype(np.int16)
            if int(np.abs(delta).max()) > protector.budget_levels:
                raise VideoValidationError("A protected keyframe exceeded the perturbation budget and was discarded.")
            key_data[si] = (frame, delta, temporal._gray(frame))
            key_summaries.append({"frame": seg.key, "scene": seg.scene, **summary})
            control.progress(f"protecting_keyframe_{si + 1}_of_{K}", P_SCENES + (P_KEYS - P_SCENES) * ((si + 1) / K))

        # --------------------------------------------------------- propagate
        stats = temporal.TemporalStats()
        control.progress("propagating", P_KEYS)
        seg_of = {}
        for si, seg in enumerate(segments):
            for t in range(seg.start, seg.end):
                seg_of[t] = si
        for t in range(n_frames):
            check()
            si = seg_of[t]
            seg = segments[si]
            frame = _read(_frame_path(frames_dir, t))
            kf, kd, kg = key_data[si]
            if t == seg.key:
                out, used = temporal.apply_delta(frame, kd), "keyframe"
            else:
                delta, used = temporal.propagate_delta(frame, kf, kd, options.temporal_mode, kg)
                out = temporal.apply_delta(frame, delta)
            _write(_frame_path(prot_dir, t), out)
            stats.add(frame, out, seg.scene, si, used)
            control.progress("propagating", P_KEYS + (P_PROP - P_KEYS) * ((t + 1) / n_frames))
        key_data.clear()
        if stats.pert_max > protector.budget_levels:   # defence in depth; cannot happen by construction
            raise VideoValidationError("Propagated frames exceeded the perturbation budget and were discarded.")

        # ------------------------------------------------------------ encode
        control.progress("encoding", P_PROP)
        prof = PROFILES[options.output_profile]
        out_path = work / ("out" + prof["ext"])
        audio = info.audio
        cmd = _base(limits) + ["-protocol_whitelist", "file", "-framerate", _fps_arg(fps),
                               "-start_number", "0", "-i", str(prot_dir / "%06d.png")]
        audio_note = None
        if audio:
            # The video is re-timed to start at 0 (setpts=PTS-STARTPTS). The audio keeps its own
            # timestamps, so shifting it by minus the video's original start keeps their relative offset.
            offset = -info.start_time
            if abs(offset) > 0.001:
                cmd += ["-itsoffset", f"{offset:.6f}"]
            cmd += ["-protocol_whitelist", "file", "-f", demux, "-i", str(src)]
        cmd += ["-map", "0:v:0"] + (["-map", "1:a:0"] if audio else [])
        if options.output_profile == "compatible":
            cmd += ["-vf", f"scale=out_color_matrix={matrix}:out_range=tv,format=yuv420p",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "16"] + _tags(matrix) + ["-movflags", "+faststart"]
            can_copy = audio and audio.codec in MP4_AUDIO_COPY_OK
        else:
            cmd += ["-vf", "format=gbrp", "-c:v", "ffv1", "-level", "3"]
            can_copy = audio and audio.codec in MKV_AUDIO_COPY_OK
        if audio:
            if can_copy:
                cmd += ["-c:a", "copy"]
                audio_note = f"audio stream copied without re-encoding ({audio.codec})"
            else:
                cmd += ["-c:a", "aac", "-b:a", "160k"]
                audio_note = f"audio re-encoded from {audio.codec} to aac (container cannot carry it unchanged)"
        cmd += ["-map_metadata", "-1", "-map_chapters", "-1", str(out_path)]

        def poll_encode() -> None:
            control.progress("encoding", P_PROP + 0.01)
        ffmpeg.run(cmd, timeout_s=limits.ffmpeg_timeout_s, should_stop=stop, on_poll=poll_encode)
        if not out_path.is_file() or out_path.stat().st_size == 0:
            raise VideoProcessingError("The video could not be exported.", code="video_export_failed")
        control.progress("encoding", P_ENCODE)

        # ---------------------------------------------------------- validate
        control.progress("validating", P_ENCODE)
        record_validation = _validate_output(out_path, prof, info, matrix, n_frames, frames_dir, prot_dir,
                                             dec_dir, limits, protector.budget_levels, control)
        control.progress("validating", P_VALIDATE)

        record = {
            "engine": "video_shield_experimental",
            "status_note": "EXPERIMENTAL: protection effectiveness has not been independently validated, "
                           "for images or video.",
            "options": {"strength": options.strength, "output_profile": options.output_profile,
                        "temporal_mode": options.temporal_mode, "seed": options.seed,
                        "keyframe_interval": options.keyframe_interval, "max_steps_per_keyframe": options.max_steps},
            "input": info.public(),
            "frames": {"count": n_frames, "frame_rate": float(fps), "scene_count": len(starts),
                       "scene_starts": starts, "keyframes": K, "keyframe_interval_relaxed": relaxed},
            "audio": {"present": bool(audio), "handling": audio_note if audio else "no audio stream in input",
                      "dropped_additional_audio_streams": info.extra_audio_streams},
            "temporal_consistency": stats.summary(),
            "keyframe_results": key_summaries,
            "output": {"container": prof["mime"], "bytes": out_path.stat().st_size,
                       "colour_matrix": matrix, **record_validation["output"]},
            "validation": record_validation["checks"],
            "metadata": "Container metadata of the input (title, GPS, etc.) is not copied to the output.",
            "effectiveness": None,
            "timing_seconds": {"total": round(time.perf_counter() - t_start, 3)},
        }
        return {"output_file": out_path, "mime": prof["mime"], "extension": prof["ext"],
                "filename": f"protected-{job_label or 'video'}{prof['ext']}", "record": record}
    finally:
        for d in ("frames", "protected", "decoded"):
            shutil.rmtree(work / d, ignore_errors=True)
        try:
            (work / "input.bin").unlink()
        except FileNotFoundError:
            pass


def _validate_output(out_path: Path, prof: dict, info: probe_mod.VideoInfo, matrix: str, n_frames: int,
                     frames_dir: Path, prot_dir: Path, dec_dir: Path, limits: VideoLimits,
                     budget: int, control: Control) -> dict:
    """Re-open the exported file and check it. Raises VideoValidationError on structural failure.

    Budget failures are NOT raised for the lossy profile: they are measured and reported, because
    the honest outcome there is 'output delivered, budget not guaranteed' - never 'budget satisfied'.
    """
    stop = control.should_stop
    out_info = probe_mod.probe(out_path, prof["container"], limits, stop)
    w, h = info.display_size
    expect_codec = "h264" if prof["ext"] == ".mp4" else "ffv1"
    checks: dict = {}
    if out_info.codec != expect_codec:
        raise VideoValidationError("The exported video has an unexpected codec.")
    if out_info.display_size != (w, h):
        raise VideoValidationError("The exported video dimensions differ from the input.")
    checks["codec_ok"], checks["dimensions_preserved"] = True, True
    fps_err = abs(float(out_info.fps) - float(info.fps)) / float(info.fps)
    if fps_err > 0.01:
        raise VideoValidationError("The exported video frame rate differs from the input.")
    checks["frame_rate_preserved"] = True
    if abs(out_info.duration - n_frames / float(info.fps)) > max(2 / float(info.fps), 0.1):
        raise VideoValidationError("The exported video duration is wrong.")
    checks["duration_ok"] = True

    # audio presence + synchronisation
    if info.audio:
        if out_info.audio is None:
            raise VideoValidationError("Audio was lost during export.")
        checks["audio_present"] = True
        tol = max(2 / float(info.fps), 0.1)
        off_in = info.audio.start_time - info.start_time
        off_out = out_info.audio.start_time - out_info.start_time
        # Audio that starts BEFORE the first video frame cannot keep a negative timestamp in the output,
        # so that leading part is trimmed and the streams then start together. Reported, not hidden.
        expected_off = max(off_in, 0.0)
        if off_in < -0.001:
            checks["audio_leading_trimmed_seconds"] = round(-off_in, 3)
        if abs(off_out - expected_off) > tol:
            raise VideoValidationError("Audio and video start offsets changed during export.")
        if info.audio.duration is not None and out_info.audio.duration is not None:
            end_in = (info.audio.start_time + info.audio.duration) - (info.start_time + info.duration)
            end_out = (out_info.audio.start_time + out_info.audio.duration) - (out_info.start_time + out_info.duration)
            if abs(end_out - end_in) > tol:
                raise VideoValidationError("Audio and video are out of sync after export.")
        checks["audio_video_sync_ok"] = True
    else:
        checks["audio_present"] = False

    # decode the exported file and compare against the ORIGINAL decoded frames
    in_matrix = f"scale=in_color_matrix={matrix}:in_range=tv,format=rgb24" if prof["ext"] == ".mp4" else "format=rgb24"
    ffmpeg.run(_base(limits) + ["-protocol_whitelist", "file", "-f", DEMUXER[prof["container"]], "-i", str(out_path),
                                "-map", "0:v:0", "-an", "-vf", in_matrix, "-fps_mode", "passthrough",
                                "-frames:v", str(n_frames + 1), "-start_number", "0", str(dec_dir / "%06d.png")],
               timeout_s=limits.ffmpeg_timeout_s, should_stop=stop)
    decoded_n = sum(1 for _ in dec_dir.iterdir())
    if decoded_n != n_frames:
        raise VideoValidationError(f"The exported video has {decoded_n} frames, expected {n_frames}.")
    checks["frame_count_preserved"] = True
    worst, sum_abs, pix, mse_sum = 0, 0.0, 0, 0.0
    corr_sum = 0.0
    for t in range(n_frames):
        if stop():
            raise JobCancelled()
        o = _read(_frame_path(frames_dir, t)).astype(np.int16)
        p = _read(_frame_path(prot_dir, t)).astype(np.int16)
        d = _read(_frame_path(dec_dir, t)).astype(np.int16)
        diff = np.abs(d - o)
        worst = max(worst, int(diff.max()))
        sum_abs += float(diff.sum())
        mse_sum += float(((d - p) ** 2).mean())
        pix += diff.size
        a, b = (d - o).ravel().astype(np.float64), (p - o).ravel().astype(np.float64)
        na, nb = np.linalg.norm(a), np.linalg.norm(b)
        corr_sum += float(a @ b / (na * nb)) if na > 0 and nb > 0 else 0.0
        control.progress("validating", P_ENCODE + (P_VALIDATE - P_ENCODE) * ((t + 1) / n_frames))
    lossless = prof["ext"] == ".mkv"
    satisfied = worst <= budget
    mse = mse_sum / n_frames
    psnr = float("inf") if mse == 0 else 10 * np.log10(255.0 ** 2 / mse)
    if lossless and not satisfied:
        raise VideoValidationError("Lossless export changed pixels beyond the perturbation budget and was discarded.")
    return {"checks": checks, "output": {
        "lossless": lossless,
        "budget_integer_levels": budget,
        "max_change_vs_original_after_encoding": worst,
        "mean_abs_change_vs_original_after_encoding": round(sum_abs / pix, 4),
        "budget_satisfied_after_encoding": bool(satisfied),
        "budget_note": ("Exact: lossless export, every decoded frame is within the integer budget of its source frame."
                        if lossless and satisfied else
                        ("The lossy H.264 export changed pixels beyond the perturbation budget (codec noise plus perturbation). "
                         "The budget is NOT satisfied for this file. Use the lossless profile to keep it exact."
                         if not satisfied else
                         "Measured within budget on this file, but H.264 does not guarantee that in general.")),
        "psnr_encoded_vs_protected_frames_db": None if psnr == float("inf") else round(float(psnr), 2),
        "perturbation_correlation_after_encoding": round(corr_sum / n_frames, 4),
    }}
