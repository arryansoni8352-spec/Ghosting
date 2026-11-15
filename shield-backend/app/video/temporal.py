"""Temporal consistency for Video Shield.

Design (implemented here, measured in tests/video/test_temporal.py):

1. The clip is split into scenes (see scenes.py). A scene change is a *controlled reset*: the
   perturbation is never carried across a cut.
2. Each scene is split into segments of at most `interval` frames. Each segment has ONE keyframe
   (its middle frame) that is protected by the image engine. The keyframe's perturbation
   `delta = protected - original` is an exact integer image bounded by the engine's budget.
3. Every other frame of the segment receives that same `delta`, either unchanged ("static") or
   resampled along dense optical flow from the frame to the keyframe ("flow", OpenCV Farneback,
   nearest-neighbour sampling so no value is ever blended or enlarged). A quality gate falls back
   to the static delta for any frame where flow compensation does not reduce the residual against
   the keyframe.
4. out = clip(frame + delta). Because delta is bounded by the budget and clipping only shrinks
   magnitudes, the integer budget holds on the lossless intermediate frames BY CONSTRUCTION.
   Lossy encoding afterwards can break it; the pipeline measures that and reports it.

What this does NOT show: that a perturbation optimised for one frame protects the other frames of
the segment against any model. That transfer is untested. The method trades per-frame optimisation
for temporal stability and bounded compute (engine runs = number of keyframes, not frames).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from app.core.errors import VideoLimitError

try:                                    # optional: needed for optical-flow mode only
    import cv2
except Exception:                       # noqa: BLE001
    cv2 = None


LOW_MOTION_MAE = 1.5                 # mean abs grey-level difference to the keyframe below which frames count as static
FLOW_MAX_RELATIVE_RESIDUAL = 0.5     # warped keyframe must leave < 50% of the unwarped residual
FLOW_MAX_ABSOLUTE_RESIDUAL = 20.0    # ... and no more than this many grey levels in absolute terms


def optical_flow_available() -> bool:
    return cv2 is not None


@dataclass(frozen=True)
class Segment:
    start: int          # first frame (inclusive)
    end: int            # last frame (exclusive)
    key: int            # keyframe index
    scene: int          # scene number

    @property
    def length(self) -> int:
        return self.end - self.start


def plan_segments(n_frames: int, scene_start_list: list[int], interval: int | None,
                  max_keyframes: int) -> tuple[list[Segment], bool]:
    """Split scenes into segments. Returns (segments, interval_relaxed).

    If the segments needed for `interval` exceed `max_keyframes`, fall back to one segment per
    scene (interval_relaxed=True). If even that exceeds the budget, raise VideoLimitError.
    """
    if n_frames <= 0:
        return [], False
    bounds = list(scene_start_list) + [n_frames]
    scenes = [(bounds[i], bounds[i + 1]) for i in range(len(scene_start_list))]

    def build(iv: int | None) -> list[Segment]:
        segs: list[Segment] = []
        for si, (s, e) in enumerate(scenes):
            length = e - s
            parts = 1 if not iv or length <= iv else math.ceil(length / iv)
            for p in range(parts):
                a = s + (length * p) // parts
                b = s + (length * (p + 1)) // parts
                segs.append(Segment(a, b, a + (b - a) // 2, si))
        return segs

    segs = build(interval)
    relaxed = False
    if len(segs) > max_keyframes:
        segs, relaxed = build(None), True
    if len(segs) > max_keyframes:
        raise VideoLimitError(
            f"The video has {len(scenes)} scene(s), which needs {len(segs)} protected keyframes. "
            f"The limit is {max_keyframes}. Use a shorter clip with fewer scene changes.")
    return segs, relaxed


def _gray(rgb: np.ndarray) -> np.ndarray:
    return (rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114).astype(np.uint8)


def propagate_delta(frame: np.ndarray, key_frame: np.ndarray, key_delta: np.ndarray, mode: str,
                    key_gray: np.ndarray | None = None) -> tuple[np.ndarray, str]:
    """Delta (int16, HxWx3) to add to `frame`. Returns (delta, mode_used).

    mode_used is 'static', 'flow', 'static_low_motion' (flow requested, frame ~identical to the keyframe,
    so sharing the delta unchanged is already ideal) or 'static_fallback' (flow requested but not
    clearly beneficial, or OpenCV unavailable).
    """
    if mode == "static":
        return key_delta, "static"
    if cv2 is None:
        return key_delta, "static_fallback"
    g_t = _gray(frame)
    g_k = key_gray if key_gray is not None else _gray(key_frame)
    flow = cv2.calcOpticalFlowFarneback(g_t, g_k, None, 0.5, 3, 15, 3, 5, 1.2, 0)
    h, w = g_t.shape
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    map_x, map_y = gx + flow[..., 0], gy + flow[..., 1]
    warped_key = cv2.remap(key_frame, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    err_flow = float(np.abs(warped_key.astype(np.int16) - frame.astype(np.int16)).mean())
    err_static = float(np.abs(key_frame.astype(np.int16) - frame.astype(np.int16)).mean())
    if err_static < LOW_MOTION_MAE:
        return key_delta, "static_low_motion"
    # Require a clear improvement AND a small absolute residual: on unrelated content Farneback can
    # still find *some* warp that lowers the residual, which must not be trusted.
    if err_flow > FLOW_MAX_RELATIVE_RESIDUAL * err_static or err_flow > FLOW_MAX_ABSOLUTE_RESIDUAL:
        return key_delta, "static_fallback"
    delta = cv2.remap(key_delta, map_x, map_y, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE)
    return delta, "flow"


def apply_delta(frame: np.ndarray, delta: np.ndarray) -> np.ndarray:
    return np.clip(frame.astype(np.int16) + delta, 0, 255).astype(np.uint8)


class TemporalStats:
    """Streaming frame-to-frame consistency measurements.

    flicker excess for a pair (t-1, t) = mean |(P_t - P_{t-1}) - (O_t - O_{t-1})| in 0..255 units,
    i.e. how much the protected video changes between frames BEYOND how the original changes.
    Zero means the perturbation is temporally perfectly stable. Tests compare this number for the
    shared-perturbation method against independent per-frame perturbations.

    Pairs are bucketed: 'within_segment' (same segment), 'across_reset' (a planned segment reset
    inside one scene) and 'scene_cut' pairs are excluded from both (a cut is expected to change).
    """

    def __init__(self) -> None:
        self._prev_o = self._prev_p = None
        self._prev_scene = self._prev_seg = None
        self.sums = {"within_segment": 0.0, "across_reset": 0.0}
        self.counts = {"within_segment": 0, "across_reset": 0}
        self.pert_abs_sum = 0.0
        self.pert_pixels = 0
        self.pert_max = 0
        self.mode_counts: dict[str, int] = {}

    def add(self, original: np.ndarray, protected: np.ndarray, scene: int, segment: int, mode_used: str) -> None:
        o, p = original.astype(np.int16), protected.astype(np.int16)
        d = np.abs(p - o)
        self.pert_abs_sum += float(d.sum())
        self.pert_pixels += d.size
        self.pert_max = max(self.pert_max, int(d.max()) if d.size else 0)
        self.mode_counts[mode_used] = self.mode_counts.get(mode_used, 0) + 1
        if self._prev_o is not None and scene == self._prev_scene:
            key = "within_segment" if segment == self._prev_seg else "across_reset"
            excess = np.abs((p - self._prev_p) - (o - self._prev_o)).mean()
            self.sums[key] += float(excess)
            self.counts[key] += 1
        self._prev_o, self._prev_p, self._prev_scene, self._prev_seg = o, p, scene, segment

    def summary(self) -> dict:
        def mean(k: str) -> float | None:
            return round(self.sums[k] / self.counts[k], 4) if self.counts[k] else None
        return {
            "flicker_excess_within_segment": mean("within_segment"),
            "flicker_excess_across_reset": mean("across_reset"),
            "pairs_within_segment": self.counts["within_segment"],
            "pairs_across_reset": self.counts["across_reset"],
            "mean_abs_perturbation": round(self.pert_abs_sum / self.pert_pixels, 4) if self.pert_pixels else None,
            "max_abs_perturbation": self.pert_max,
            "propagation_modes": dict(self.mode_counts),
            "units": "8-bit levels (0-255)",
        }
