"""Registry of pretrained weights used by Style Shield, with checksum verification.

Weights are downloaded on demand into `models/` (git-ignored) and verified by SHA-256 before
use. A download or checksum failure raises an error; nothing is silently substituted.
"""
from __future__ import annotations

import hashlib
import logging
import os
import pathlib
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

MODELS_DIR = pathlib.Path(__file__).resolve().parents[3] / "models"


@dataclass(frozen=True)
class WeightSpec:
    name: str
    url: str
    filename: str
    sha256: str
    size_bytes: int
    architecture: str
    source_repo: str
    licence_code: str
    licence_weights: str
    licence_confirmed: bool = False


MOBILENET_V1_NOTOP = WeightSpec(
    name="mobilenet_v1_1.0_224_notop_imagenet",
    url=("https://github.com/fchollet/deep-learning-models/releases/download/v0.6/"
         "mobilenet_1_0_224_tf_no_top.h5"),
    filename="mobilenet_1_0_224_tf_no_top.h5",
    sha256="9f9cfd8c925431c06ce96744e1d201575f6a681bf38ae2de38e2ae8f7d7829d3",
    size_bytes=17225924,
    architecture="MobileNetV1 width 1.0 (no classifier head)",
    source_repo="fchollet/deep-learning-models release v0.6 (packaging); TF-Slim model zoo (origin)",
    licence_code="MIT (packaging repository); Apache-2.0 for tensorflow/models/research (origin code)",
    licence_weights=("UNRESOLVED: checkpoint licence statement not located; distributed through the "
                     "Apache-2.0 TF-Slim model zoo. Residual uncertainty recorded in docs/STYLE_SHIELD_DESIGN.md."),
    licence_confirmed=False,
)

SQUEEZENET_V1_1_NOTOP = WeightSpec(
    name="squeezenet_v1.1_notop_imagenet",
    url="https://github.com/rcmalli/keras-squeezenet/releases/download/v1.0/"
        "squeezenet_weights_tf_dim_ordering_tf_kernels_notop.h5",
    filename="squeezenet_v1.1_notop_imagenet.h5",
    sha256="2d935d8c102ad1232484a77da8e6fbdf3ff4ab608974a0d8b6283115ffff204f",
    size_bytes=3032184,
    architecture="SqueezeNet v1.1 (Fire modules, no classifier head)",
    source_repo="rcmalli/keras-squeezenet release v1.0 (packaging); "
                "forresti/SqueezeNet, original authors (origin: Iandola et al. 2016, "
                "DeepScale/UC Berkeley/Stanford)",
    licence_code="MIT (packaging repository, verified); BSD-2-Clause (original authors' "
                 "repository forresti/SqueezeNet, verified directly from its LICENSE file - "
                 "this covers the pretrained model file itself, not only wrapper code)",
    licence_weights=("BSD-2-Clause. Unlike MobileNetV1, this checkpoint's licence IS confirmed: "
                     "the original SqueezeNet authors' own repository (forresti/SqueezeNet, "
                     "GitHub-reported license BSD-2-Clause) distributes the pretrained Caffe "
                     "model file directly, and that licence file was read and verified."),
    licence_confirmed=True,
)

REGISTRY = {spec.name: spec for spec in (MOBILENET_V1_NOTOP, SQUEEZENET_V1_1_NOTOP)}


log = logging.getLogger("ghosting_shield.weights")

CONNECT_TIMEOUT_S = 15
READ_TIMEOUT_S = 30
TOTAL_DEADLINE_S = 300
CHUNK = 1 << 16


class WeightIntegrityError(RuntimeError):
    """Downloaded or on-disk weights failed SHA-256 verification."""


class WeightDownloadError(RuntimeError):
    """Weights could not be downloaded within the configured limits."""


def sha256_of(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _download(spec: WeightSpec, dest: pathlib.Path, max_bytes: int) -> None:
    """Stream to `dest` with connect/read timeouts, an overall deadline and a byte cap."""
    req = urllib.request.Request(spec.url, headers={"User-Agent": "ghosting-shield/weights"})
    deadline = time.monotonic() + TOTAL_DEADLINE_S
    try:
        resp = urllib.request.urlopen(req, timeout=CONNECT_TIMEOUT_S)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise WeightDownloadError(f"could not connect to the weight source ({type(exc).__name__})") from exc
    total = 0
    with resp, dest.open("wb") as out:
        if getattr(resp, "status", 200) != 200:
            raise WeightDownloadError(f"unexpected HTTP status {resp.status}")
        declared = resp.headers.get("Content-Length")
        if declared and declared.isdigit() and int(declared) > max_bytes:
            raise WeightDownloadError("declared size exceeds the configured maximum")
        while True:
            if time.monotonic() > deadline:
                raise WeightDownloadError("download exceeded the overall time limit")
            try:
                chunk = resp.read(CHUNK)
            except (TimeoutError, OSError) as exc:
                raise WeightDownloadError("download stalled or was interrupted") from exc
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise WeightDownloadError("download exceeded the maximum allowed size")
            out.write(chunk)


def ensure_weights(spec: WeightSpec, models_dir: pathlib.Path = MODELS_DIR,
                   allow_download: bool = True) -> pathlib.Path:
    """Return the path of VERIFIED weights, downloading them if needed.

    - The file is only ever moved into place after its SHA-256 matches the registry.
    - Downloads go to a temporary file which is deleted on any failure.
    - An existing file with a wrong checksum is refused (not silently replaced).
    """
    models_dir.mkdir(parents=True, exist_ok=True)
    path = models_dir / spec.filename
    max_bytes = int(spec.size_bytes * 1.05) + 1024
    if not path.exists():
        if not allow_download:
            raise FileNotFoundError(f"weights not present ({spec.filename}); run: python -m app.cli check-models --download")
        tmp = models_dir / (spec.filename + ".part")
        try:
            _download(spec, tmp, max_bytes)
            digest = sha256_of(tmp)
            if digest != spec.sha256:
                raise WeightIntegrityError(f"checksum mismatch for downloaded {spec.filename}")
            os.replace(tmp, path)          # atomic on the same filesystem
        finally:
            if tmp.exists():
                tmp.unlink()
        log.info("weights downloaded and verified: %s", spec.name)
        return path
    digest = sha256_of(path)
    if digest != spec.sha256:
        raise WeightIntegrityError(
            f"existing {spec.filename} fails its checksum; delete it and re-run check-models --download")
    return path


def weights_status(spec: WeightSpec, models_dir: pathlib.Path = MODELS_DIR) -> dict:
    """Report whether verified weights are present. Never downloads and never exposes paths."""
    path = models_dir / spec.filename
    if not path.exists():
        return {"name": spec.name, "present": False, "verified": False,
                "note": "not downloaded; run: python -m app.cli check-models --download"}
    try:
        ok = sha256_of(path) == spec.sha256
    except OSError:
        ok = False
    return {"name": spec.name, "present": True, "verified": ok,
            "note": "verified" if ok else "present but FAILS checksum"}
