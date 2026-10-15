"""FastAPI dependency helpers for task_orchestrator_service."""

from __future__ import annotations

from fastapi import Request


def get_bearer_authorization(request: Request) -> str | None:
    """Return the raw Authorization header value (may be None)."""
    return request.headers.get("Authorization")
