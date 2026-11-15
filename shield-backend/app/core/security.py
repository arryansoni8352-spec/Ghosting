"""Authentication and rate-limiting integration points.

Authentication
- SHIELD_AUTH_MODE=disabled (default, DEVELOPMENT ONLY): no check is performed. /health reports
  this explicitly. Production mode refuses to start with this setting.
- SHIELD_AUTH_MODE=open: no access key is required to create jobs. Per-job ownership tokens and rate
  limiting still apply. Suitable only where abuse is handled upstream (gateway, CAPTCHA) or
  acceptable.
- SHIELD_AUTH_MODE=api_key: the request must send an X-API-Key header whose SHA-256 digest is one of
  the digests listed in SHIELD_API_KEY_SHA256. Only digests are configured; raw keys are never stored.
  Comparison is constant-time. This is a simple shared-key scheme, not user accounts.

Rate limiting
- SHIELD_RATE_LIMIT_PER_MINUTE (default 30; 0 disables). Token bucket per client address.
- In-memory and single-process only. A multi-instance deployment must enforce limits at a gateway.

Neither mechanism is a substitute for a production identity provider. See docs/SECURITY.md.
"""
from __future__ import annotations

import hashlib
import hmac
import threading
import time

from fastapi import Depends, Request

from app.config.settings import get_settings
from app.core.errors import AuthRequiredError, RateLimitedError


def _digest(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def verify_api_key(presented: str | None, allowed_digests: list[str]) -> bool:
    if not presented or not allowed_digests:
        return False
    d = _digest(presented)
    ok = False
    for allowed in allowed_digests:
        ok = hmac.compare_digest(d, allowed) or ok   # no early exit: constant time over the list
    return ok


class TokenBucketLimiter:
    def __init__(self, per_minute: int, clock=time.monotonic):
        self._rate = per_minute / 60.0
        self._capacity = float(max(per_minute, 1))
        self._clock = clock
        self._buckets: dict[str, tuple[float, float]] = {}
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self._rate > 0

    def check(self, key: str) -> float | None:
        """Return None if allowed, else the number of seconds to wait."""
        if not self.enabled:
            return None
        now = self._clock()
        with self._lock:
            tokens, last = self._buckets.get(key, (self._capacity, now))
            tokens = min(self._capacity, tokens + (now - last) * self._rate)
            if tokens >= 1.0:
                self._buckets[key] = (tokens - 1.0, now)
                return None
            self._buckets[key] = (tokens, now)
            return (1.0 - tokens) / self._rate


_limiter: TokenBucketLimiter | None = None
_read_limiter: TokenBucketLimiter | None = None


def get_limiter() -> TokenBucketLimiter:
    global _limiter
    if _limiter is None:
        _limiter = TokenBucketLimiter(get_settings().rate_limit_per_minute)
    return _limiter


def get_read_limiter() -> TokenBucketLimiter:
    global _read_limiter
    if _read_limiter is None:
        _read_limiter = TokenBucketLimiter(get_settings().read_rate_limit_per_minute)
    return _read_limiter


def reset_limiter() -> None:
    global _limiter, _read_limiter
    _limiter = None
    _read_limiter = None


def require_auth(request: Request) -> None:
    settings = get_settings()
    if settings.auth_mode in ("disabled", "open"):
        return
    presented = request.headers.get("x-api-key")
    if not verify_api_key(presented, settings.api_key_digests):
        raise AuthRequiredError("A valid API key is required.")


def enforce_rate_limit(request: Request) -> None:
    _enforce(request, get_limiter())


def enforce_read_rate_limit(request: Request) -> None:
    _enforce(request, get_read_limiter())


def _enforce(request: Request, limiter: TokenBucketLimiter) -> None:
    client = request.client.host if request.client else "unknown"
    wait = limiter.check(client)
    if wait is not None:
        err = RateLimitedError("Too many requests. Please wait before retrying.")
        err.retry_after = max(1, int(wait) + 1)
        raise err


def job_token(request: Request) -> str | None:
    """The caller's per-job ownership token (X-Job-Token header), or None."""
    token = request.headers.get("x-job-token")
    return token.strip() if token else None


PROTECTED = [Depends(require_auth), Depends(enforce_rate_limit)]
PROTECTED_READ = [Depends(require_auth), Depends(enforce_read_rate_limit)]
