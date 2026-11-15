"""End-to-end pipeline tests: real ffmpeg, real frames, FakeProtector instead of the AI engine."""
import dataclasses
import stat
import subprocess
import threading
import time

import pytest

from app.core.errors import JobCancelled, VideoProcessingError, VideoValidationError
from app.video import pipeline, probe as P
from tests.video.conftest import FakeProtector, ff, make_two_scene_video, make_video


def run(path, workdir, limits, container="mp4", profile="compatible", mode="flow", protector=None, control=None,
        interval=24):
    return pipeline.run_pipeline(
        data=path.read_bytes(), container=container, workdir=workdir, limits=limits,
        options=pipeline.VideoOptions(output_profile=profile, temporal_mode=mode, keyframe_interval=interval),
        protector=protector or FakeProtector(), control=control, job_label="t")


def stream_md5(path, kind="a"):
    out = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-map", f"0:{kind}:0", "-f", "md5", "-"],
                         capture_output=True, text=True, check=True).stdout.strip()
    return out


def probe_out(res, limits):
    path = res["output_file"]
    return P.probe(path, "mp4" if path.suffix == ".mp4" else "webm", limits)


def test_frame_extraction_and_reconstruction(vid_dir, workdir, limits):
    src = make_video(vid_dir / "a.mp4")
    res = run(src, workdir, limits)
    rec = res["record"]
    assert rec["frames"]["count"] == 24 and rec["frames"]["frame_rate"] == 12.0
    out = probe_out(res, limits)
    assert out.codec == "h264" and out.display_size == (96, 64) and abs(float(out.fps) - 12) < 0.1
    assert abs(out.duration - 2.0) < 0.15
    assert rec["validation"]["frame_count_preserved"] and rec["validation"]["dimensions_preserved"]
    assert res["mime"] == "video/mp4" and res["extension"] == ".mp4"


def test_audio_is_preserved_bit_exactly_when_copied(vid_dir, workdir, limits):
    src = make_video(vid_dir / "a.mp4")
    res = run(src, workdir, limits)
    assert res["record"]["audio"]["present"] and "copied without re-encoding" in res["record"]["audio"]["handling"]
    assert stream_md5(src) == stream_md5(res["output_file"])        # decoded audio identical to the input's
    assert res["record"]["validation"]["audio_video_sync_ok"] is True


def test_video_without_audio_has_no_audio_stream(vid_dir, workdir, limits):
    res = run(make_video(vid_dir / "n.mp4", audio=False), workdir, limits)
    assert res["record"]["audio"]["present"] is False
    assert probe_out(res, limits).audio is None


def test_webm_opus_audio_is_transcoded_to_aac_and_stays_in_sync(vid_dir, workdir, limits):
    src = make_video(vid_dir / "a.webm", vcodec="libvpx-vp9", acodec="libopus", extra_v=("-b:v", "300k"))
    res = run(src, workdir, limits, container="webm")
    out = probe_out(res, limits)
    assert out.audio and out.audio.codec == "aac"
    assert "re-encoded from opus to aac" in res["record"]["audio"]["handling"]
    assert res["record"]["validation"]["audio_video_sync_ok"] is True
    assert abs(out.audio.duration - out.duration) < 0.15


def test_audio_start_offset_is_preserved(vid_dir, workdir, limits):
    """Input whose audio starts 0.3 s late: the offset must survive reconstruction (synchronisation)."""
    base = make_video(vid_dir / "a.mp4", audio=False)
    tone = vid_dir / "t.m4a"
    ff("-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "aac", str(tone))
    delayed = vid_dir / "d.mp4"
    ff("-i", str(base), "-itsoffset", "0.3", "-i", str(tone), "-map", "0:v", "-map", "1:a", "-c", "copy", str(delayed))
    info_in = P.probe(delayed, "mp4", limits)
    off_in = info_in.audio.start_time - info_in.start_time
    assert off_in > 0.2
    res = run(delayed, workdir, limits)
    out = probe_out(res, limits)
    assert abs((out.audio.start_time - out.start_time) - off_in) < 0.1
    assert res["record"]["validation"]["audio_video_sync_ok"] is True


def test_audio_before_first_frame_is_trimmed_and_reported(vid_dir, workdir, limits):
    """Video stream starts 0.5 s into the timeline while audio starts at 0: relative offset must survive."""
    base = make_video(vid_dir / "a.mp4", audio=False)
    tone = vid_dir / "t.m4a"
    ff("-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "aac", str(tone))
    late = vid_dir / "l.mp4"
    ff("-itsoffset", "0.5", "-i", str(base), "-i", str(tone), "-map", "0:v", "-map", "1:a", "-c", "copy", str(late))
    info_in = P.probe(late, "mp4", limits)
    off_in = info_in.audio.start_time - info_in.start_time
    assert off_in < -0.3
    res = run(late, workdir, limits)
    out = probe_out(res, limits)
    # audio that began before the first frame is trimmed so both streams start together (and reported)
    assert abs(out.audio.start_time - out.start_time) < 0.1
    assert res["record"]["validation"]["audio_leading_trimmed_seconds"] > 0.3
    assert res["record"]["validation"]["audio_video_sync_ok"] is True


def test_rotation_metadata_is_applied_to_pixels(vid_dir, workdir, limits):
    src = make_video(vid_dir / "a.mp4", audio=False)
    rot = vid_dir / "r.mp4"
    ff("-display_rotation", "90", "-i", str(src), "-c", "copy", str(rot))
    res = run(rot, workdir, limits)
    out = probe_out(res, limits)
    assert out.display_size == (64, 96) and out.rotation == 0
    assert res["record"]["input"]["rotation_applied"] in (90, 270)


def test_variable_frame_rate_is_converted_deliberately(vid_dir, workdir, limits):
    src = make_video(vid_dir / "a.mp4", audio=False, seconds=3)
    vfr = vid_dir / "v.mp4"
    ff("-i", str(src), "-vf", "select='not(mod(n,5)-1)+not(mod(n,7))'", "-fps_mode", "vfr", "-c:v", "libx264",
       "-pix_fmt", "yuv420p", str(vfr))
    res = run(vfr, workdir, limits)
    assert any("Variable frame rate" in n for n in res["record"]["input"]["notes"])
    out = probe_out(res, limits)
    assert not out.is_vfr and abs(float(out.fps) - res["record"]["frames"]["frame_rate"]) < 0.1


def test_scene_change_resets_perturbation(vid_dir, workdir, limits):
    src = make_two_scene_video(vid_dir / "s.mp4")
    fp = FakeProtector()
    res = run(src, workdir, limits, protector=fp)
    f = res["record"]["frames"]
    assert f["scene_count"] == 2 and f["scene_starts"] == [0, 12] and f["keyframes"] == 2
    assert sorted(fp.calls) == [6, 18]                    # one protected keyframe per scene (their middles)
    # the cut itself is excluded from the consistency measurement
    assert res["record"]["temporal_consistency"]["pairs_within_segment"] == 22


def test_keyframe_budget_is_enforced(vid_dir, workdir, limits):
    src = make_two_scene_video(vid_dir / "s.mp4")
    with pytest.raises(Exception) as e:
        run(src, workdir, dataclasses.replace(limits, max_keyframes=1), interval=None)
    assert "keyframes" in str(e.value)


def test_lossless_profile_is_exact_and_budget_verified(vid_dir, workdir, limits):
    res = run(make_video(vid_dir / "a.mp4"), workdir, limits, profile="lossless")
    o = res["record"]["output"]
    assert o["lossless"] and o["budget_satisfied_after_encoding"] is True
    assert o["max_change_vs_original_after_encoding"] <= o["budget_integer_levels"] == 4
    assert o["perturbation_correlation_after_encoding"] == 1.0
    assert res["extension"] == ".mkv"


def test_lossy_profile_never_claims_a_budget_it_did_not_meet(vid_dir, workdir, limits):
    res = run(make_video(vid_dir / "a.mp4", audio=False), workdir, limits)
    o = res["record"]["output"]
    assert o["lossless"] is False
    assert o["budget_satisfied_after_encoding"] == (o["max_change_vs_original_after_encoding"] <= o["budget_integer_levels"])
    if not o["budget_satisfied_after_encoding"]:
        assert "NOT satisfied" in o["budget_note"]
    assert res["record"]["effectiveness"] is None and "EXPERIMENTAL" in res["record"]["status_note"]


def test_progress_is_real_and_monotonic(vid_dir, workdir, limits):
    seen = []
    run(make_video(vid_dir / "a.mp4"), workdir, limits,
        control=pipeline.Control(progress=lambda s, f: seen.append((s, f))))
    fr = [f for _, f in seen]
    assert fr == sorted(fr) and fr[0] == 0.0 and fr[-1] == 1.0
    stages = [s for s, _ in dict.fromkeys(seen)]
    for want in ("probing", "extracting_frames", "detecting_scenes", "propagating", "encoding", "validating"):
        assert want in {s for s, _ in seen}


def test_temporary_files_removed_after_success(vid_dir, workdir, limits):
    run(make_video(vid_dir / "a.mp4"), workdir, limits)
    assert sorted(p.name for p in workdir.iterdir()) == ["out.mp4"]


@pytest.mark.parametrize("when", ["probing", "extracting_frames", "propagating"])
def test_cancellation_stops_work_and_cleans_up(vid_dir, workdir, limits, when):
    flag = {"stop": False}

    def progress(stage, frac):
        if stage == when and (when == "probing" or frac > 0):
            flag["stop"] = True
    with pytest.raises(JobCancelled):
        run(make_video(vid_dir / "a.mp4"), workdir, limits,
            control=pipeline.Control(should_stop=lambda: flag["stop"], progress=progress))
    assert not (workdir / "frames").exists() and not (workdir / "protected").exists()
    assert not (workdir / "input.bin").exists()


def test_cancel_during_keyframe_protection(vid_dir, workdir, limits):
    flag = {"stop": False}
    threading.Timer(0.3, lambda: flag.__setitem__("stop", True)).start()
    with pytest.raises(JobCancelled):
        run(make_video(vid_dir / "a.mp4"), workdir, limits, protector=FakeProtector(delay=10),
            control=pipeline.Control(should_stop=lambda: flag["stop"]))
    assert list(workdir.iterdir()) == []


def _wrapper(tmp_path, body):
    w = tmp_path / "fakeffmpeg.sh"
    w.write_text("#!/bin/sh\n" + body)
    w.chmod(w.stat().st_mode | stat.S_IEXEC)
    return str(w)


def test_ffmpeg_timeout_is_enforced(vid_dir, workdir, limits, tmp_path):
    fake = _wrapper(tmp_path, "sleep 30\n")
    lim = dataclasses.replace(limits, ffmpeg_path=fake, ffmpeg_timeout_s=1)
    t0 = time.time()
    with pytest.raises(VideoProcessingError) as e:
        run(make_video(vid_dir / "a.mp4"), workdir, lim)
    assert e.value.code == "video_step_timeout" and time.time() - t0 < 10
    assert list(workdir.iterdir()) == []


def test_failed_export_is_reported_and_cleaned_up(vid_dir, workdir, limits, tmp_path):
    fake = _wrapper(tmp_path, 'case "$*" in *libx264*) echo boom >&2; exit 1;; esac\nexec ffmpeg "$@"\n')
    lim = dataclasses.replace(limits, ffmpeg_path=fake)
    with pytest.raises(VideoProcessingError) as e:
        run(make_video(vid_dir / "a.mp4"), workdir, lim)
    assert "boom" not in str(e.value)                       # tool output never reaches the client
    assert list(workdir.iterdir()) == []


def test_missing_ffmpeg_binary_is_a_clean_error(vid_dir, workdir, limits):
    with pytest.raises(VideoProcessingError):
        run(make_video(vid_dir / "a.mp4"), workdir, dataclasses.replace(limits, ffmpeg_path="/nonexistent/ffmpeg"))


def test_export_that_loses_audio_is_rejected(vid_dir, workdir, limits, tmp_path):
    # wrapper strips the audio mapping from the encode call only
    body = ('case "$*" in *libx264*) args=""; skip=0; for a in "$@"; do\n'
            '  if [ "$skip" = 1 ]; then skip=0; continue; fi\n'
            '  if [ "$a" = "-map" ]; then n="$2"; fi\n'
            '  args="$args $a"; done;; esac\nexec ffmpeg "$@" -an\n')
    fake = _wrapper(tmp_path, 'case "$*" in *libx264*) exec ffmpeg "$@" ;; esac\nexec ffmpeg "$@"\n')
    # simpler & deterministic: validate directly with a silent output against an input that has audio
    src = make_video(vid_dir / "a.mp4")
    silent = make_video(vid_dir / "silent.mp4", audio=False)
    info = P.probe(src, "mp4", limits)
    with pytest.raises(VideoValidationError):
        pipeline._validate_output(silent, pipeline.PROFILES["compatible"], info, "bt601", 24,
                                  workdir, workdir, workdir, limits, 4, pipeline.Control())
