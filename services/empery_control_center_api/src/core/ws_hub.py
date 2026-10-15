"""In-memory WebSocket fan-out hub."""

from __future__ import annotations

import logging
from typing import Any

from core.logging import log_event

from services.empery_control_center_api.src.data.schemas import WsServerMessage


class WsHub:
    """Process-local set of connected WebSocket clients."""

    def __init__(self, logger: logging.Logger) -> None:
        self._logger = logger
        self._clients: set[Any] = set()
        # Optional per-client topic filters (empty = all)
        self._filters: dict[Any, set[str]] = {}

    async def connect(self, websocket: Any) -> None:
        await websocket.accept()
        self._clients.add(websocket)
        self._filters[websocket] = set()

    async def disconnect(self, websocket: Any) -> None:
        self._clients.discard(websocket)
        self._filters.pop(websocket, None)

    def set_topics(self, websocket: Any, topics: list[str]) -> None:
        self._filters[websocket] = set(topics)

    def clear_topics(self, websocket: Any) -> None:
        self._filters[websocket] = set()

    def client_count(self) -> int:
        return len(self._clients)

    async def broadcast(self, message: WsServerMessage) -> None:
        dead: list[Any] = []
        payload = message.model_dump(mode="json")
        for client in list(self._clients):
            allowed = self._filters.get(client) or set()
            if allowed and message.event_name and message.event_name not in allowed:
                if message.type not in {"hello", "heartbeat", "error"}:
                    continue
            try:
                await client.send_json(payload)
            except Exception:  # noqa: BLE001 — drop dead clients
                dead.append(client)
        for client in dead:
            await self.disconnect(client)
        if dead:
            log_event(
                self._logger,
                event="ecc.ws.clients_dropped",
                message="Dropped dead WebSocket clients",
                count=len(dead),
            )
