"""ASGI middleware that enforces a hard byte limit on request bodies while they are received.

Starlette parses multipart bodies before route code runs, so a route-level check alone would
allow an unbounded body to be buffered. This middleware refuses a request whose declared
Content-Length is too large, and stops receiving as soon as the running total exceeds the limit.
"""
from __future__ import annotations

import json


class _BodyTooLarge(Exception):
    pass


class BodyLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        declared = dict(scope.get("headers", [])).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await self._send_413(send)
            return

        received = 0
        started = False

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLarge()
            return message

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _BodyTooLarge:
            if not started:
                await self._send_413(send)

    async def _send_413(self, send):
        body = json.dumps({"error": "upload_too_large",
                           "message": "The request exceeds the upload size limit."}).encode()
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"),
                                (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})


class SecurityHeadersMiddleware:
    """Adds defensive headers to every response. Pure ASGI: it never buffers bodies."""

    HEADERS = [(b"x-content-type-options", b"nosniff"), (b"referrer-policy", b"no-referrer"),
               (b"cache-control", b"no-store"), (b"x-frame-options", b"DENY"),
               (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'")]

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def wrapped(message):
            if message["type"] == "http.response.start":
                present = {k.lower() for k, _ in message.get("headers", [])}
                message = dict(message)
                message["headers"] = list(message.get("headers", [])) + [h for h in self.HEADERS if h[0] not in present]
            await send(message)
        await self.app(scope, receive, wrapped)
