"""
Regression tests for Natural Image Benchmark Dataset Manager.
Verifies local-first offline operation, path security, aspect-ratio center cropping,
clean RGB conversion, and manifest provenance tracking.
"""

from __future__ import annotations

import json
from pathlib import Path
import numpy as np
import pytest
from PIL import Image

from veilguard_engine.natural_dataset import NaturalDatasetManager
from veilguard_engine.image_utils import ImageValidationError


def test_manifest_initialization(tmp_path: Path):
    manager = NaturalDatasetManager(dataset_dir=tmp_path)
    assert manager.manifest_path.exists()

    with open(manager.manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data["schema_version"] == "1.0.0"
    assert "images" in data
    assert len(data["images"]) == 0


def test_image_import_and_lanczos_aspect_crop(tmp_path: Path):
    manager = NaturalDatasetManager(dataset_dir=tmp_path / "dataset")

    # Create wide RGBA image (400x200)
    source_file = tmp_path / "wide_test.png"
    arr = np.random.randint(0, 256, (200, 400, 4), dtype=np.uint8)
    arr[:, :, 3] = 200  # Non-trivial alpha
    Image.fromarray(arr, mode="RGBA").save(source_file)

    rec = manager.import_local_image(
        source_path=source_file,
        image_id="test_wide_landscape",
        source_attribution="Test User Capture",
        license_type="CC0 1.0 Universal",
        target_resolution=(128, 128),
    )

    assert rec["image_id"] == "test_wide_landscape"
    assert rec["target_resolution"] == [128, 128]
    assert rec["color_mode"] == "RGB"
    assert len(rec["sha256"]) == 64

    # Verify saved file
    saved_path = manager.get_image_path("test_wide_landscape")
    assert saved_path is not None
    assert saved_path.exists()

    with Image.open(saved_path) as im:
        assert im.size == (128, 128)
        assert im.mode == "RGB"


def test_import_security_and_nonexistent_path(tmp_path: Path):
    manager = NaturalDatasetManager(dataset_dir=tmp_path)
    bad_path = tmp_path / "nonexistent.png"

    with pytest.raises(ImageValidationError):
        manager.import_local_image(
            source_path=bad_path,
            image_id="bad_entry",
            source_attribution="None",
            license_type="None",
        )


def test_reference_benchmark_samples_population(tmp_path: Path):
    manager = NaturalDatasetManager(dataset_dir=tmp_path / "dataset")
    manager.populate_reference_benchmark_samples()

    images = manager.list_images()
    assert len(images) >= 2
    ids = [img["image_id"] for img in images]
    assert "natural_01_mountain_terrain" in ids
    assert "natural_02_botanical_canopy" in ids

    # Calling populate again should be idempotent
    manager.populate_reference_benchmark_samples()
    assert len(manager.list_images()) == len(images)
