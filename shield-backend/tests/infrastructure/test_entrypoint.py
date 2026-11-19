"""Tests for docker-entrypoint.sh behaviour without requiring uvicorn.

We replace uvicorn in $PATH with a stub that echoes its arguments and exits 0, so the
script can run to completion and we can inspect what arguments it would have passed.
"""
import os
import stat
import subprocess
import tempfile
import textwrap

ENTRYPOINT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../docker-entrypoint.sh"))


def _run(forwarded_ips: str) -> subprocess.CompletedProcess:
    """Run the entrypoint with a stub uvicorn that echoes its args, return the process result."""
    with tempfile.TemporaryDirectory() as stub_dir:
        stub = os.path.join(stub_dir, "uvicorn")
        with open(stub, "w") as f:
            f.write('#!/bin/sh\necho "UVICORN_ARGS: $*"\nexit 0\n')
        os.chmod(stub, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
        env = {**os.environ, "PATH": f"{stub_dir}:{os.environ.get('PATH','')}",
               "SHIELD_FORWARDED_ALLOW_IPS": forwarded_ips}
        return subprocess.run([ENTRYPOINT], capture_output=True, text=True, timeout=10, env=env)


def test_entrypoint_exists_and_is_executable():
    assert os.path.isfile(ENTRYPOINT), f"entrypoint missing: {ENTRYPOINT}"
    assert os.access(ENTRYPOINT, os.X_OK), "entrypoint not executable"


def test_entrypoint_shebang():
    with open(ENTRYPOINT) as f:
        shebang = f.readline().strip()
    assert shebang in ("#!/bin/sh", "#!/bin/bash"), f"bad shebang: {shebang}"


def test_wildcard_star_rejected():
    r = _run("*")
    assert r.returncode != 0, "wildcard * must cause non-zero exit"
    assert "not permitted" in r.stderr, f"expected 'not permitted' in stderr, got: {r.stderr!r}"


def test_wildcard_with_space_rejected():
    r = _run("* ")
    assert r.returncode != 0


def test_empty_string_starts_without_forwarded_flag():
    r = _run("")
    assert r.returncode == 0, f"empty value should start cleanly; stderr: {r.stderr!r}"
    assert "--forwarded-allow-ips" not in r.stdout, (
        "empty SHIELD_FORWARDED_ALLOW_IPS must not pass --forwarded-allow-ips to uvicorn"
    )
    assert "--proxy-headers" not in r.stdout


def test_valid_cidr_passes_forwarded_flag():
    r = _run("10.0.0.1")
    assert r.returncode == 0, f"valid IP should start cleanly; stderr: {r.stderr!r}"
    assert "--forwarded-allow-ips" in r.stdout
    assert "10.0.0.1" in r.stdout


def test_valid_cidr_range_accepted():
    r = _run("172.16.0.0/12")
    assert r.returncode == 0
    assert "172.16.0.0/12" in r.stdout


def test_workers_always_one():
    """The entrypoint must always pass --workers 1 (single-process requirement)."""
    r = _run("")
    assert r.returncode == 0
    assert "--workers 1" in r.stdout or "--workers" not in r.stdout, (
        "If --workers is passed, it must be 1"
    )
    # Confirm it's actually there
    r2 = _run("10.0.0.0/8")
    assert "--workers" in r2.stdout and "1" in r2.stdout.split("--workers")[1][:5]


def test_no_access_log_always_set():
    r = _run("")
    assert r.returncode == 0
    assert "--no-access-log" in r.stdout
