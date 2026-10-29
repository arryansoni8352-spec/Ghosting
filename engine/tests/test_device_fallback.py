from __future__ import annotations
from pathlib import Path
import numpy as np
import pytest
from PIL import Image

def test_device_selection_cpu_fallback(tmp_path: Path) -> None:
    p = tmp_path / "in.png"
    Image.fromarray(np.random.randint(0, 255, (64, 64, 3), dtype=np.uint8), mode="RGB").save(str(p))
    from veilguard_engine.adapters.feature_disruption import FeatureDisruptionAdapter
    adapter = FeatureDisruptionAdapter()
    out = tmp_path / "cuda_fallback_test.png"
    res = adapter.run(
        input_path=p,
        output_path=out,
        params={"strength": 8.0, "iterations": 2},
        device="cuda",
        seed=1,
        timeout_seconds=30,
        progress_callback=lambda p, m: None,
    )
    assert res["status"] == "success"
    assert out.exists()
