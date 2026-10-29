
from __future__ import annotations

import os
from pathlib import Path
import numpy as np
import pytest
from PIL import Image

@pytest.fixture
def sample_png(tmp_path: Path) -> Path:
    p = tmp_path / "sample.png"
    img = Image.fromarray(np.random.randint(0, 255, (64, 64, 3), dtype=np.uint8), mode="RGB")
    img.save(str(p), format="PNG")
    return p

class TestFeatureDisruptionAdapter:
    def test_descriptor(self) -> None:
        from veilguard_engine.adapters.feature_disruption import FeatureDisruptionAdapter
        adapter = FeatureDisruptionAdapter()
        desc = adapter.descriptor()
        assert desc["id"] == "neural-feature-disruption"
        assert desc["commercialUseReviewed"] is True
        assert desc["status"] in ("EXPERIMENTAL", "PRODUCTION_READY")

    def test_runs_and_produces_output(self, sample_png: Path, tmp_path: Path) -> None:
        from veilguard_engine.adapters.feature_disruption import FeatureDisruptionAdapter
        adapter = FeatureDisruptionAdapter()
        out = tmp_path / "protected_feature.png"
        progress_events: list[tuple[int, str]] = []

        res = adapter.run(
            input_path=sample_png,
            output_path=out,
            params={"strength": 8.0, "iterations": 3},
            device="cpu",
            seed=42,
            timeout_seconds=30,
            progress_callback=lambda pct, msg: progress_events.append((pct, msg)),
        )
        assert res["status"] == "success"
        assert out.exists()
        assert out.stat().st_size > 0
        assert len(progress_events) >= 3

    def test_preserves_original(self, sample_png: Path, tmp_path: Path) -> None:
        from veilguard_engine.adapters.feature_disruption import FeatureDisruptionAdapter
        adapter = FeatureDisruptionAdapter()
        orig_bytes = sample_png.read_bytes()
        out = tmp_path / "protected_feature2.png"

        adapter.run(
            input_path=sample_png,
            output_path=out,
            params={"strength": 8.0, "iterations": 2},
            device="cpu",
            seed=42,
            timeout_seconds=30,
            progress_callback=lambda p, m: None,
        )
        assert sample_png.read_bytes() == orig_bytes


class TestPhotoGuardAdapter:
    def test_descriptor_reports_blocker_faithfully(self) -> None:
        from veilguard_engine.adapters.photoguard import PhotoGuardEncoderAdapter
        adapter = PhotoGuardEncoderAdapter()
        desc = adapter.descriptor()
        assert desc["id"] == "photoguard-encoder-attack"
        assert desc["status"] in ("BLOCKED", "RESEARCH_ONLY")
        assert "Blocked" in desc["statusReason"] or desc["status"] == "RESEARCH_ONLY"

    def test_run_blocked_without_weights(self, sample_png: Path, tmp_path: Path) -> None:
        from veilguard_engine.adapters.photoguard import PhotoGuardEncoderAdapter
        adapter = PhotoGuardEncoderAdapter()
        out = tmp_path / "photoguard_out.png"
        res = adapter.run(
            input_path=sample_png,
            output_path=out,
            params={},
            device="cpu",
            seed=42,
            timeout_seconds=30,
            progress_callback=lambda p, m: None,
        )
        # Must return failure with explicit ALGORITHM_BLOCKED or DEPENDENCY_MISSING code, never faking
        assert res["status"] == "failure"
        assert res["error"]["code"] in ("ALGORITHM_BLOCKED", "DEPENDENCY_MISSING")
