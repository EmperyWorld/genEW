"""Chat and collaboration domain: WebSocket. Telegram removed."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI  # type: ignore[import-untyped]


def register_domain_chat(app: FastAPI) -> None:
    """Register chat and collaboration routers."""
    from api.routers.websocket_handler import router as websocket_handler_router  # noqa: PLC0415

    app.include_router(websocket_handler_router, prefix="/api", tags=["WebSocket"])
