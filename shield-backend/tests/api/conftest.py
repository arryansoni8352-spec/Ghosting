import io
import os

import pytest
from PIL import Image

from app.evaluation import art_generator


@pytest.fixture
def app_env(monkeypatch, tmp_path):
    """Fast, isolated settings for API tests: short timeouts, a private job directory."""
    monkeypatch.setenv("SHIELD_JOB_TIMEOUT_SECONDS", "10")
    monkeypatch.setenv("SHIELD_JOB_TTL_SECONDS", "60")
    monkeypatch.setenv("SHIELD_SYNC_WAIT_SECONDS", "1")
    monkeypatch.setenv("SHIELD_MAX_UPLOAD_MB", "1")
    monkeypatch.setenv("SHIELD_MAX_INPUT_PIXELS", str(256 * 256))
    monkeypatch.setenv("SHIELD_JOB_DIR", str(tmp_path / "jobs"))
    monkeypatch.setenv("SHIELD_MAX_CONCURRENT_JOBS", "1")
    monkeypatch.setenv("SHIELD_MAX_QUEUED_JOBS", "1")
    monkeypatch.setenv("SHIELD_RATE_LIMIT_PER_MINUTE", "0")
    monkeypatch.setenv("SHIELD_AUTH_MODE", "disabled")
    monkeypatch.setenv("SHIELD_IMAGE_INPUT_POLICY", "any")   # legacy tests use JPEG/lossy WebP inputs
    from app.config.settings import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _install_stub(monkeypatch):
    """Replace the Style Shield optimiser with a fast stand-in (see stub_engine)."""
    import time
    import numpy as np
    from app.core.errors import JobCancelled
    from app.engines.style_shield import engine as eng
    from app.engines.style_shield import optimise as opt
    from app.utils import images

    def fake_run(self, src, preset_name, out_format="png", quality=None, seed=0, max_steps=None,
                 control=None, input_bytes_len=0, webp_lossless=False):
        control = control or eng.Control()
        steps = max_steps or opt.PRESETS[preset_name].steps
        for i in range(steps):
            if control.should_stop():
                raise JobCancelled()
            control.progress("cloaking", i / steps)
            time.sleep(0.02)
        rng = np.random.default_rng(seed)
        noise = rng.integers(-1, 2, size=src.pixels.shape)
        pix = np.clip(src.pixels.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        data = images.encode(src.mode, pix, src.alpha, out_format, quality,
                             lossless=(out_format == "webp" and webp_lossless))
        info = images.FORMAT_INFO[images.OUTPUT_FORMATS[out_format]]
        record = {"engine": "style_shield", "stub": True, "effectiveness": None,
                  "output": {"format": out_format, "mime": info[1], "budget_integer_levels": 1,
                             "max_change_after_encoding": 1, "budget_satisfied_after_encoding": True}}
        return eng.ProcessResult(encoded=data, mime=info[1], extension=info[2], record=record)

    monkeypatch.setattr(eng.StyleShieldEngine, "run", fake_run)
    monkeypatch.setattr(eng.StyleShieldEngine, "readiness",
                        lambda self: {"ready": True, "code": "stub", "message": "stub engine"})


@pytest.fixture
def stub_engine(monkeypatch):
    """Fast stand-in for the Style Shield optimiser so API, job-manager, validation, ownership,
    cancellation and cleanup behaviour is tested WITHOUT model weights. It sleeps 20 ms per step and
    honours cancellation, so timeout/cancel tests behave realistically. Real-engine behaviour is
    covered only by tests marked `model`."""
    _install_stub(monkeypatch)


def _make_client_class():
    from fastapi.testclient import TestClient

    class TokenClient(TestClient):
        """TestClient that remembers each job's owner token (from the creation response) and sends it
        automatically on later /jobs/{id} requests, as the website does. Tests that exercise ownership
        use `raw_client` (no automatic token) or pass an explicit X-Job-Token header."""

        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self.tokens: dict[str, str] = {}

        def request(self, method, url, *args, **kwargs):
            path = str(url).split("?")[0]
            parts = path.strip("/").split("/")
            if len(parts) >= 2 and parts[0] == "jobs":
                headers = dict(kwargs.get("headers") or {})
                tok = self.tokens.get(parts[1])
                if tok and not any(k.lower() == "x-job-token" for k in headers):
                    headers["X-Job-Token"] = tok
                    kwargs["headers"] = headers
            resp = super().request(method, url, *args, **kwargs)
            try:
                if resp.status_code in (200, 202) and "application/json" in resp.headers.get("content-type", ""):
                    body = resp.json()
                    if isinstance(body, dict) and body.get("job_id") and body.get("owner_token"):
                        self.tokens[body["job_id"]] = body["owner_token"]
            except ValueError:
                pass
            return resp

    return TokenClient


@pytest.fixture
def client(app_env, stub_engine):
    from app.main import create_app
    app = create_app()
    with _make_client_class()(app) as c:
        yield c


@pytest.fixture
def raw_client(app_env, stub_engine):
    """Plain TestClient: sends no job token unless the test supplies one."""
    from app.main import create_app
    from fastapi.testclient import TestClient
    with TestClient(create_app()) as c:
        yield c


def png_bytes(style="A1", seed=1, size=48):
    arr = art_generator.paint(style, seed, size)
    b = io.BytesIO()
    Image.fromarray(arr).save(b, "PNG")
    return b.getvalue()


@pytest.fixture
def real_client(app_env):
    """Client wired to the REAL engine (no stub). Needs verified weights; use only in `model` tests."""
    from app.main import create_app
    with _make_client_class()(create_app()) as c:
        yield c


@pytest.fixture
def client_factory(app_env, monkeypatch):
    """Build started clients with extra SHIELD_* settings: client_factory(stub=True, SHIELD_X='1').

    All clients are closed at teardown. `stub=False` wires the real engine (no weights -> honest 503).
    """
    from contextlib import ExitStack
    stack = ExitStack()

    def make(stub: bool = True, **env):
        from app.config.settings import get_settings
        for k, v in env.items():
            monkeypatch.setenv(k, str(v))
        get_settings.cache_clear()
        if stub:
            stack.enter_context(_stub_context())
        from app.main import create_app
        return stack.enter_context(_make_client_class()(create_app()))

    yield make
    stack.close()
    from app.config.settings import get_settings
    get_settings.cache_clear()


def _stub_context():
    """Context manager version of the stub_engine fixture (for use inside client_factory)."""
    from contextlib import contextmanager

    @contextmanager
    def ctx():
        mp = pytest.MonkeyPatch()
        try:
            _install_stub(mp)
            yield
        finally:
            mp.undo()
    return ctx()
