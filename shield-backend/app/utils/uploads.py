"""Bounded upload reading. The upload is streamed in chunks into a spooled temporary file.

- Memory use is capped by `spool_bytes`; larger uploads spill to a temporary file.
- Reading stops the moment the byte limit is exceeded. Partial data is discarded.
- The temporary file is always closed; the caller owns the returned bytes.
"""
from __future__ import annotations

import tempfile

from fastapi import UploadFile

from app.core.errors import UploadTooLargeError

CHUNK = 1 << 16


async def read_bounded(upload: UploadFile, max_bytes: int, spool_bytes: int = 1 << 20) -> bytes:
    total = 0
    spool = tempfile.SpooledTemporaryFile(max_size=spool_bytes)
    try:
        while True:
            chunk = await upload.read(CHUNK)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise UploadTooLargeError(f"The file exceeds the {max_bytes // (1024 * 1024)} MB upload limit.")
            spool.write(chunk)
        spool.seek(0)
        return spool.read()
    finally:
        spool.close()
        await upload.close()
