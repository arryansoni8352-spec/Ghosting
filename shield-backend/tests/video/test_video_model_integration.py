"""Real-engine video integration. REQUIRES verified MobileNetV1 weights (licence unresolved).

Marked `model`: excluded from the default offline run, and it FAILS (never silently skips) when the
weights are unavailable, matching the rest of the project's model-test convention.
Run:  python -m app.cli check-models --download   (operator decision)  then  pytest -m model
"""
import pytest

from app.video import pipeline
from tests.conftest import require_model_weights
from tests.video.conftest import make_video

pytestmark = pytest.mark.model


def test_real_engine_on_a_tiny_clip(vid_dir, workdir, limits):
    require_model_weights()
    from app.core.registry import get_engine
    from app.video.protector import StyleShieldFrameProtector
    src = make_video(vid_dir / "a.mp4", seconds=1, fps=6, size="64x64", audio=True)
    prot = StyleShieldFrameProtector(get_engine("style_shield"), "low", seed=0, max_steps=5)
    res = pipeline.run_pipeline(data=src.read_bytes(), container="mp4", workdir=workdir, limits=limits,
                                options=pipeline.VideoOptions(strength="low", output_profile="lossless", max_steps=5),
                                protector=prot)
    o = res["record"]["output"]
    assert o["budget_satisfied_after_encoding"] and o["max_change_vs_original_after_encoding"] <= o["budget_integer_levels"]
    assert res["record"]["effectiveness"] is None
