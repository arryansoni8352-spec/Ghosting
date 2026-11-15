"""INFRASTRUCTURE / API TEST. Backend (JAX) detection reported by /health.

Replaces the Phase 1 app/core/device.py (PyTorch-based) module, which is removed: this project
uses JAX, and that module always reported torch_installed=False / cuda_available=False regardless
of the real backend, which the Phase 1/2 audit flagged as stale and misleading.
"""
from app.api.routes_health import backend_info


def test_backend_info_reports_real_jax_state():
    info = backend_info()
    assert info["jax_installed"] is True
    assert info["active_backend"] in {"cpu", "gpu", "cuda", "rocm", "tpu"}
    assert isinstance(info["devices"], list) and len(info["devices"]) >= 1
    assert info["cpu_available"] or info["gpu_available"]


def test_gpu_not_claimed_without_a_gpu_device():
    """Having CUDA PACKAGES installed must not be confused with having a GPU DEVICE."""
    info = backend_info()
    platforms = {d["platform"] for d in info["devices"]}
    assert info["gpu_available"] == bool(platforms & {"gpu", "cuda", "rocm"})
