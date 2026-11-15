"""Temporal consistency: what is implemented, and what the measurements actually show."""
import cv2
import numpy as np
import pytest

from app.core.errors import VideoLimitError
from app.video import pipeline, scenes, temporal
from tests.video.conftest import FakeProtector, ff, make_video


def texture(seed=0, size=96):
    rng = np.random.default_rng(seed)
    g = cv2.GaussianBlur(rng.integers(0, 256, (size, size, 3), dtype=np.uint8), (0, 0), 2.5)
    return cv2.normalize(g, None, 20, 235, cv2.NORM_MINMAX)


# ------------------------------------------------------------------- planning
def test_plan_segments_one_keyframe_per_scene_by_default():
    segs, relaxed = temporal.plan_segments(30, [0, 10], 24, 4)
    assert [(s.start, s.end, s.key) for s in segs] == [(0, 10, 5), (10, 30, 20)] and not relaxed


def test_plan_segments_splits_long_scenes_into_bounded_chunks():
    segs, _ = temporal.plan_segments(48, [0], 12, 8)
    assert len(segs) == 4 and all(s.length <= 12 for s in segs)
    assert segs[0].start == 0 and segs[-1].end == 48 and all(a.end == b.start for a, b in zip(segs, segs[1:]))


def test_plan_segments_relaxes_interval_then_refuses():
    segs, relaxed = temporal.plan_segments(100, [0], 10, 3)           # 10 chunks needed > 3 -> 1 per scene
    assert relaxed and len(segs) == 1
    with pytest.raises(VideoLimitError):
        temporal.plan_segments(100, [0, 20, 40, 60], 10, 3)           # 4 scenes alone exceed the budget


def test_scene_detection_finds_hard_cut_and_ignores_noise():
    a, b = np.full((64, 96, 3), 40, np.uint8), np.full((64, 96, 3), 200, np.uint8)
    rng = np.random.default_rng(1)
    clip = [a, a, np.clip(a + rng.integers(-3, 4, a.shape), 0, 255).astype(np.uint8), b, b]
    starts = scenes.scene_starts([scenes.signature(f) for f in clip])
    assert starts == [0, 3]


# ---------------------------------------------------------------- propagation
def test_static_mode_shares_the_exact_delta():
    f = texture(); d = np.random.default_rng(0).integers(-4, 5, f.shape).astype(np.int16)
    out, mode = temporal.propagate_delta(np.roll(f, 2, 1), f, d, "static")
    assert mode == "static" and out is d


def test_optical_flow_tracks_known_translation_better_than_static():
    """Ground truth: the content moved 3 px right, so the perturbation must move with it."""
    key = texture(7)
    delta = np.random.default_rng(0).integers(-4, 5, key.shape).astype(np.int16)
    frame = np.roll(key, 3, axis=1)
    truth = np.roll(delta, 3, axis=1)
    flow, mode = temporal.propagate_delta(frame, key, delta, "flow")
    inner = (slice(8, -8), slice(12, -12))
    err_flow = np.abs(flow[inner] - truth[inner]).mean()
    err_static = np.abs(delta[inner] - truth[inner]).mean()
    assert mode == "flow"
    assert err_flow < 0.25 * err_static, (err_flow, err_static)


def test_flow_quality_gate_falls_back_when_frames_are_unrelated():
    d = np.random.default_rng(0).integers(-4, 5, (96, 96, 3)).astype(np.int16)
    _, mode = temporal.propagate_delta(texture(1), texture(2), d, "flow")
    assert mode == "static_fallback"


def test_propagation_never_exceeds_the_budget():
    key = texture(3)
    d = np.random.default_rng(1).integers(-4, 5, key.shape).astype(np.int16)
    for shift in (0, 1, 5):
        frame = np.roll(key, shift, 1)
        delta, _ = temporal.propagate_delta(frame, key, d, "flow")
        assert np.abs(delta).max() <= 4
        out = temporal.apply_delta(frame, delta)
        assert np.abs(out.astype(int) - frame.astype(int)).max() <= 4
    bright = np.full((8, 8, 3), 254, np.uint8)
    assert temporal.apply_delta(bright, np.full((8, 8, 3), 4, np.int16)).max() == 255      # clip, not wrap


# ------------------------------------------------------------ consistency metric
def test_shared_perturbation_flickers_far_less_than_independent_noise_on_a_static_scene():
    frame = texture(5)
    rng = np.random.default_rng(0)
    shared = temporal.TemporalStats(); indep = temporal.TemporalStats()
    d = rng.integers(-4, 5, frame.shape).astype(np.int16)
    for t in range(12):
        shared.add(frame, temporal.apply_delta(frame, d), 0, 0, "static")
        indep.add(frame, temporal.apply_delta(frame, rng.integers(-4, 5, frame.shape).astype(np.int16)), 0, 0, "indep")
    s, i = shared.summary()["flicker_excess_within_segment"], indep.summary()["flicker_excess_within_segment"]
    assert s == 0.0 and i > 2.0


def test_pipeline_temporal_consistency_vs_per_frame_independent_baseline(vid_dir, workdir, limits):
    """Same clip, same noise amplitude: shared keyframe perturbation vs independent per-frame perturbation.
    Static-camera clip (SMPTE bars). Measured end to end through the real pipeline."""
    src = make_video(vid_dir / "bars.mp4", source="smptebars", audio=False, seconds=2)
    res = pipeline.run_pipeline(data=src.read_bytes(), container="mp4", workdir=workdir, limits=limits,
                                options=pipeline.VideoOptions(output_profile="lossless", temporal_mode="static"),
                                protector=FakeProtector(m=4))
    shared = res["record"]["temporal_consistency"]["flicker_excess_within_segment"]
    # independent baseline: protect every frame separately, measure the same quantity
    from PIL import Image
    import subprocess, io
    frames = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(src), "-f", "image2pipe", "-vcodec", "png", "-"],
                            capture_output=True, check=True).stdout.split(b"\x89PNG\r\n\x1a\n")[1:]
    arrs = [np.asarray(Image.open(io.BytesIO(b"\x89PNG\r\n\x1a\n" + b)).convert("RGB")) for b in frames]
    fp, base = FakeProtector(m=4), temporal.TemporalStats()
    for i, a in enumerate(arrs):
        out, _ = fp.protect(a, None, i)
        base.add(a, out, 0, 0, "indep")
    independent = base.summary()["flicker_excess_within_segment"]
    assert independent > 1.5
    assert shared < 0.2 * independent, (shared, independent)
    assert res["record"]["output"]["budget_satisfied_after_encoding"] is True


def test_reset_pairs_are_reported_separately(vid_dir, workdir, limits):
    src = make_video(vid_dir / "bars.mp4", source="smptebars", audio=False, seconds=3)
    res = pipeline.run_pipeline(data=src.read_bytes(), container="mp4", workdir=workdir, limits=limits,
                                options=pipeline.VideoOptions(output_profile="lossless", temporal_mode="static",
                                                              keyframe_interval=12),
                                protector=FakeProtector())
    tc = res["record"]["temporal_consistency"]
    assert res["record"]["frames"]["keyframes"] == 3
    assert tc["pairs_across_reset"] == 2 and tc["pairs_within_segment"] == 33
    assert tc["flicker_excess_across_reset"] > tc["flicker_excess_within_segment"]   # resets are the cost of bounded drift
