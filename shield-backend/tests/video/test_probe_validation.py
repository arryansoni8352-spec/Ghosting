"""Format, codec, duration, resolution, frame-rate validation on tiny synthetic videos."""
import dataclasses
import os
import subprocess

import pytest

from app.core.errors import UnsupportedVideoError, VideoCorruptError, VideoLimitError
from app.video import probe as P
from app.video.signature import sniff_video
from tests.video.conftest import ff, make_video


def test_signature_sniffing():
    assert sniff_video(b"\x00\x00\x00\x18ftypmp42" + b"0" * 20) == "mp4"
    assert sniff_video(b"\x1a\x45\xdf\xa3" + b"0" * 20) == "webm"
    assert sniff_video(b"GIF89a" + b"0" * 30) is None
    assert sniff_video(b"#EXTM3U\n#EXT-X-VERSION:3\n") is None      # HLS playlist is not a video container


def test_probe_reports_real_stream_properties(vid_dir, limits):
    p = make_video(vid_dir / "a.mp4")
    info = P.probe(p, "mp4", limits)
    P.validate(info, limits)
    assert (info.codec, info.display_size, float(info.fps)) == ("h264", (96, 64), 12.0)
    assert 1.9 < info.duration < 2.2 and info.estimated_frames == 24
    assert info.audio and info.audio.codec == "aac" and info.rotation == 0 and not info.is_vfr


def test_webm_vp9_opus_is_supported(vid_dir, limits):
    p = make_video(vid_dir / "a.webm", vcodec="libvpx-vp9", acodec="libopus", extra_v=("-b:v", "200k"))
    info = P.probe(p, "webm", limits)
    P.validate(info, limits)
    assert info.codec == "vp9" and info.audio.codec == "opus"


def test_video_without_audio(vid_dir, limits):
    info = P.probe(make_video(vid_dir / "n.mp4", audio=False), "mp4", limits)
    assert info.audio is None


def test_unsupported_video_codec_rejected(vid_dir, limits):
    p = make_video(vid_dir / "m.mp4", vcodec="mpeg4", audio=False)
    info = P.probe(p, "mp4", limits)
    with pytest.raises(UnsupportedVideoError) as e:
        P.validate(info, limits)
    assert "mpeg4" in str(e.value) and e.value.status_code == 415


def test_corrupt_and_truncated_input_rejected(vid_dir, limits):
    bad = vid_dir / "bad.mp4"
    bad.write_bytes(b"\x00\x00\x00\x18ftypmp42" + os.urandom(4000))
    with pytest.raises(VideoCorruptError):
        P.probe(bad, "mp4", limits)
    good = make_video(vid_dir / "g.mp4", audio=False)
    data = good.read_bytes()
    trunc = vid_dir / "t.mp4"
    trunc.write_bytes(data[: len(data) // 3])
    with pytest.raises(VideoCorruptError):
        P.probe(trunc, "mp4", limits)


@pytest.mark.parametrize("field,value,fragment", [
    ("max_duration_s", 1.0, "long"),
    ("max_pixels", 2000, "pixels"),
    ("max_fps", 5, "fps"),
    ("max_frames", 10, "frames"),
    ("max_temp_bytes", 1000, "temporary storage"),
])
def test_limits_enforced(vid_dir, limits, field, value, fragment):
    info = P.probe(make_video(vid_dir / "a.mp4"), "mp4", limits)
    with pytest.raises(VideoLimitError) as e:
        P.validate(info, dataclasses.replace(limits, **{field: value}))
    assert fragment in str(e.value) and e.value.status_code == 413


def test_rotation_metadata_swaps_display_size(vid_dir, limits):
    src = make_video(vid_dir / "a.mp4", audio=False)
    rot = vid_dir / "r.mp4"
    ff("-display_rotation", "90", "-i", str(src), "-c", "copy", str(rot))
    info = P.probe(rot, "mp4", limits)
    assert info.rotation in (90, 270) and info.display_size == (64, 96)


def test_variable_frame_rate_is_detected(vid_dir, limits):
    src = make_video(vid_dir / "a.mp4", audio=False, seconds=3)
    vfr = vid_dir / "v.mp4"
    ff("-i", str(src), "-vf", "select='not(mod(n,5)-1)+not(mod(n,7))'", "-fps_mode", "vfr", "-c:v", "libx264",
       "-pix_fmt", "yuv420p", str(vfr))
    info = P.probe(vfr, "mp4", limits)
    assert info.is_vfr and any("Variable frame rate" in n for n in info.notes)
