"""Weight download safety: timeouts, size cap, checksum verification, atomic placement.

Uses a local HTTP server so these tests do not depend on network access or real weights.
"""
import hashlib
import http.server
import threading
import time

import pytest

from app.engines.style_shield.weights import (
    WeightDownloadError, WeightIntegrityError, WeightSpec, ensure_weights,
)


def _spec(tmp_path, url, size_bytes, sha256="0" * 64, filename="w.bin"):
    return WeightSpec(name="t", url=url, filename=filename, sha256=sha256, size_bytes=size_bytes,
                      architecture="", source_repo="", licence_code="", licence_weights="")


@pytest.fixture
def server():
    """A tiny local server whose handler is set per test."""
    state = {"handler": None}

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            state["handler"](self)

    httpd = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    port = httpd.server_address[1]
    yield state, f"http://127.0.0.1:{port}/w.bin"
    httpd.shutdown()


def test_correct_checksum_is_accepted_and_atomically_placed(server, tmp_path):
    state, url = server
    payload = b"x" * 1000

    def ok(h):
        h.send_response(200)
        h.send_header("Content-Length", str(len(payload)))
        h.end_headers()
        h.wfile.write(payload)
    state["handler"] = ok
    spec = _spec(tmp_path, url, len(payload), sha256=hashlib.sha256(payload).hexdigest())
    path = ensure_weights(spec, models_dir=tmp_path)
    assert path.read_bytes() == payload
    assert not (tmp_path / (spec.filename + ".part")).exists()   # no leftover temp file


def test_wrong_checksum_is_refused_and_not_left_on_disk(server, tmp_path):
    state, url = server
    payload = b"y" * 1000

    def ok(h):
        h.send_response(200); h.send_header("Content-Length", str(len(payload))); h.end_headers()
        h.wfile.write(payload)
    state["handler"] = ok
    spec = _spec(tmp_path, url, len(payload), sha256="0" * 64)   # wrong on purpose
    with pytest.raises(WeightIntegrityError, match="checksum"):
        ensure_weights(spec, models_dir=tmp_path)
    assert not (tmp_path / spec.filename).exists()
    assert not (tmp_path / (spec.filename + ".part")).exists()


def test_oversized_download_is_stopped_and_cleaned_up(server, tmp_path):
    state, url = server
    big = b"z" * (2 * 1024 * 1024)

    def ok(h):
        h.send_response(200); h.end_headers()
        h.wfile.write(big)
    state["handler"] = ok
    spec = _spec(tmp_path, url, size_bytes=1024)   # declares a 1 KB file; server sends 2 MB
    with pytest.raises(WeightDownloadError, match="size"):
        ensure_weights(spec, models_dir=tmp_path)
    assert not (tmp_path / spec.filename).exists()
    assert not (tmp_path / (spec.filename + ".part")).exists()


def test_declared_oversized_content_length_is_refused_upfront(server, tmp_path):
    state, url = server

    def ok(h):
        h.send_response(200)
        h.send_header("Content-Length", "999999999")
        h.end_headers()
    state["handler"] = ok
    spec = _spec(tmp_path, url, size_bytes=1024)
    with pytest.raises(WeightDownloadError):
        ensure_weights(spec, models_dir=tmp_path)


def test_stalled_connection_times_out(server, tmp_path):
    state, url = server

    def stall(h):
        h.send_response(200)
        h.send_header("Content-Length", "100")
        h.end_headers()
        h.wfile.write(b"ab")
        time.sleep(40)  # longer than READ_TIMEOUT_S
    state["handler"] = stall
    spec = _spec(tmp_path, url, size_bytes=100)
    import app.engines.style_shield.weights as wmod
    old = wmod.READ_TIMEOUT_S
    wmod.READ_TIMEOUT_S = 2
    try:
        with pytest.raises(WeightDownloadError):
            ensure_weights(spec, models_dir=tmp_path)
    finally:
        wmod.READ_TIMEOUT_S = old
    assert not (tmp_path / (spec.filename + ".part")).exists()


def test_unreachable_host_raises_download_error(tmp_path):
    spec = _spec(tmp_path, "http://127.0.0.1:1/unreachable", size_bytes=10)
    with pytest.raises(WeightDownloadError):
        ensure_weights(spec, models_dir=tmp_path)


def test_existing_file_with_bad_checksum_is_refused_not_replaced(tmp_path):
    spec = _spec(tmp_path, "http://unused/", size_bytes=4)
    (tmp_path / spec.filename).write_bytes(b"junk")
    with pytest.raises(WeightIntegrityError):
        ensure_weights(spec, models_dir=tmp_path, allow_download=False)


def test_download_disabled_and_missing_raises_filenotfound(tmp_path):
    spec = _spec(tmp_path, "http://unused/", size_bytes=4)
    with pytest.raises(FileNotFoundError, match="check-models"):
        ensure_weights(spec, models_dir=tmp_path, allow_download=False)
