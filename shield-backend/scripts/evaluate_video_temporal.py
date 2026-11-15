"""Reproducible measurements for the Video Shield temporal-consistency method.

SYNTHETIC CLIPS ONLY, with a stand-in perturbation (independent +/-4 noise) instead of the AI engine.
It measures the pipeline's behaviour (flicker, perturbation survival through H.264), NOT whether any
perturbation protects against any model. Run:  python -m scripts.evaluate_video_temporal
"""
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from app.video import pipeline, temporal
from app.video.limits import VideoLimits
from tests.video.conftest import FakeProtector, ff, make_two_scene_video

LIM = VideoLimits(50 << 20, 10, 262144, 30, 300, 8, 1 << 30, 120, "ffmpeg", "ffprobe")


def clip(path: Path, source: str, seconds=3, vf: str | None = None) -> Path:
    args = ["-f", "lavfi", "-i", f"{source}=size=96x64:rate=12:duration={seconds}"]
    if vf:
        args += ["-vf", vf]
    ff(*args, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", str(path))
    return path


def frames_of(path: Path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "image2pipe", "-vcodec", "png", "-"],
                         capture_output=True, check=True).stdout.split(b"\x89PNG\r\n\x1a\n")[1:]
    return [np.asarray(Image.open(io.BytesIO(b"\x89PNG\r\n\x1a\n" + b)).convert("RGB")) for b in raw]


def run(path: Path, work: Path, profile: str, mode: str, interval=24):
    work.mkdir(parents=True, exist_ok=True)
    return pipeline.run_pipeline(data=path.read_bytes(), container="mp4", workdir=work, limits=LIM,
                                 options=pipeline.VideoOptions(output_profile=profile, temporal_mode=mode, keyframe_interval=interval),
                                 protector=FakeProtector(m=4))["record"]


def independent_flicker(path: Path) -> float:
    st, fp = temporal.TemporalStats(), FakeProtector(m=4)
    for i, a in enumerate(frames_of(path)):
        out, _ = fp.protect(a, None, i)
        st.add(a, out, 0, 0, "independent")
    return st.summary()["flicker_excess_within_segment"]


def main() -> dict:
    out = {}
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        for name, src, vf in [("static_camera_smptebars", "smptebars", None),
                              ("moving_content_testsrc2", "testsrc2", None),
                              ("global_pan_testsrc2", "testsrc2", "crop=iw-24:ih:'12+12*sin(t*2)':0,scale=96:64")]:
            p = clip(d / f"{name}.mp4", src, vf=vf)
            row = {"independent_per_frame_flicker": independent_flicker(p)}
            for mode in ("static", "flow"):
                rec = run(p, d / f"w_{name}_{mode}", "lossless", mode)
                row[f"shared_{mode}_flicker"] = rec["temporal_consistency"]["flicker_excess_within_segment"]
                row[f"shared_{mode}_modes"] = rec["temporal_consistency"]["propagation_modes"]
            out[name] = row
        p = clip(d / "bars.mp4", "smptebars", seconds=2)
        comp = run(p, d / "w_h264", "compatible", "static")
        lossless = run(p, d / "w_ll", "lossless", "static")
        out["h264_vs_lossless_static_smptebars"] = {
            "budget_levels": 4,
            "compatible_max_change_after_encoding": comp["output"]["max_change_vs_original_after_encoding"],
            "compatible_budget_satisfied": comp["output"]["budget_satisfied_after_encoding"],
            "compatible_perturbation_correlation": comp["output"]["perturbation_correlation_after_encoding"],
            "lossless_max_change_after_encoding": lossless["output"]["max_change_vs_original_after_encoding"],
            "lossless_budget_satisfied": lossless["output"]["budget_satisfied_after_encoding"],
        }
        p2 = make_two_scene_video(d / "two.mp4")
        rec = run(p2, d / "w_two", "lossless", "flow")
        out["two_scene_cut"] = {"scene_starts": rec["frames"]["scene_starts"], "keyframes": rec["frames"]["keyframes"]}
        p3 = clip(d / "long_static.mp4", "smptebars", seconds=3)
        rec = run(p3, d / "w_reset", "lossless", "static", interval=12)
        tc = rec["temporal_consistency"]
        out["segment_reset_cost_smptebars_interval12"] = {"within": tc["flicker_excess_within_segment"], "across_reset": tc["flicker_excess_across_reset"]}
    return out


if __name__ == "__main__":
    print(json.dumps(main(), indent=2))
    sys.exit(0)
