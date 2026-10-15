"""EventBus → WsHub fan-out bridge."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from core.event_bus import Event, EventBus
from core.logging import log_event

from services.empery_control_center_api.src.core.ws_hub import WsHub
from services.empery_control_center_api.src.data.schemas import WsServerMessage

REGISTRY_TOPIC = "ecc.registry.refreshed"


class EventBridge:
    """Subscribes allowlisted EventBus topics and broadcasts to WS clients."""

    def __init__(
        self,
        event_bus: EventBus,
        ws_hub: WsHub,
        logger: logging.Logger,
    ) -> None:
        self._bus = event_bus
        self._hub = ws_hub
        self._logger = logger
        self._topics: list[str] = []
        self._handlers: dict[str, Any] = {}
        self._active = False

    @property
    def subscribed_topics(self) -> list[str]:
        return list(self._topics)

    def subscribe_all(self, topics: list[str]) -> None:
        """Subscribe handlers for ``topics`` (idempotent; can grow over time)."""
        self.ensure_topics(topics)

    def ensure_topics(self, topics: list[str]) -> None:
        """Add EventBus handlers for any topics not yet subscribed."""
        added: list[str] = []
        for topic in topics:
            name = str(topic).strip()
            if not name or name in self._handlers:
                continue
            handler = self._make_handler(name)
            self._handlers[name] = handler
            self._bus.subscribe(name, handler)
            self._topics.append(name)
            added.append(name)
        self._active = True
        if added:
            log_event(
                self._logger,
                event="ecc.event_bridge.subscribed",
                message="Subscribed EventBus topics for WS fan-out",
                topics=added if self._topics == added else self._topics,
                added=added,
            )

    def unsubscribe_all(self) -> None:
        """Best-effort local teardown (EventBus cannot drop handlers)."""
        self._handlers.clear()
        self._topics = []
        self._active = False

    def _make_handler(self, topic: str):
        async def _handler(event: Event) -> None:
            await self.handle(event)

        _handler.__qualname__ = f"EventBridge.handle[{topic}]"
        return _handler

    async def handle(self, event: Event) -> None:
        try:
            ws_type = "registry" if event.name == REGISTRY_TOPIC else "event"
            message = WsServerMessage(
                type=ws_type,
                ts=datetime.now(timezone.utc),
                event_name=event.name,
                payload=dict(event.payload or {}),
                occurred_at=getattr(event, "occurred_at", None),
                source=getattr(event, "source", None),
                schema_version=getattr(event, "schema_version", None),
            )
            await self._hub.broadcast(message)
        except Exception:  # noqa: BLE001 — never break EventBus publish path
            log_event(
                self._logger,
                event="ecc.event_bridge.handler_error",
                message="Failed to bridge event to WebSocket",
                level=logging.ERROR,
                event_name=event.name,
            )
