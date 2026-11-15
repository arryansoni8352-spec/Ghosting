"""Reproducibility check: recomputed metrics must match docs/baselines.json.

Codec output can change between Pillow releases, so a baseline is only enforced when the
recorded Pillow and NumPy versions match the running environment. Otherwise the test is
skipped with the reason, and the baseline must be regenerated deliberately.
"""
import json
import pathlib

import numpy as np
import pytest
import PIL

from app.evaluation import synthetic
from app.evaluation.compare import compare_bytes
from app.utils import images
from scripts.generate_baselines import compute_cases, BASELINE_PATH

if not BASELINE_PATH.exists():
    pytest.skip("docs/baselines.json not generated yet", allow_module_level=True)

STORED = json.loads(BASELINE_PATH.read_text())


def _env_matches():
    env = STORED["environment"]
    return env["pillow"] == PIL.__version__ and env["numpy"] == np.__version__


@pytest.mark.skipif(not _env_matches(), reason="baseline recorded on a different Pillow/NumPy; regenerate")
def test_recomputed_metrics_match_stored_baseline():
    current = compute_cases()
    assert current.keys() == STORED["cases"].keys()
    for key, expected in STORED["cases"].items():
        got = current[key]
        for field, val in expected.items():
            if val is None:
                assert got[field] is None, key
            elif isinstance(val, float):
                assert got[field] == pytest.approx(val, rel=1e-6, abs=1e-6), (key, field)
            else:
                assert got[field] == val, (key, field)


def test_baseline_file_is_well_formed():
    assert "environment" in STORED and "cases" in STORED
    assert STORED["cases"], "baseline has no cases"
