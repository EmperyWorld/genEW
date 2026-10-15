"""CORS helpers and simple in-memory rate limiting for identity_service."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from core.errors import StandardizedErrorResponse


class SlidingWindowRateLimitMiddleware(BaseHTTPMiddleware):
    """Per-client IP sliding-window limiter (process-local; fine for single replica)."""

    def __init__(self, app, *, limit_per_minute: int) -> None:  # noqa: ANN001
        super().__init__(app)
        self._limit = limit_per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001
        if self._limit <= 0:
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = self._hits[client]
        while window and now - window[0] > 60.0:
            window.popleft()
        if len(window) >= self._limit:
            error = StandardizedErrorResponse(
                error_code="IDENTITY_RATE_LIMITED",
                message="Too many requests; try again shortly",
                details={"limit_per_minute": self._limit},
            )
            return JSONResponse(status_code=429, content=error.model_dump())
        window.append(now)
        return await call_next(request)
