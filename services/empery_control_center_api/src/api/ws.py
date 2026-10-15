"""WebSocket endpoints for EventBus → UI streaming."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from core.logging import log_event
from services.empery_control_center_api.config import ServiceConfig
from services.empery_control_center_api.src.core.event_bridge import EventBridge
from services.empery_control_center_api.src.core.ws_hub import WsHub
from services.empery_control_center_api.src.data.schemas import (
    WsClientMessage,
    WsServerMessage,
)

ws_router = APIRouter(tags=["websocket"])


def _parse_topics_query(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


@ws_router.websocket("/ws/events")
async def ws_events(
    websocket: WebSocket,
    topics: str | None = Query(default=None),
) -> None:
    """
    Primary EventStreamer → UI channel.

    On connect: ``hello`` with bridged topics.
    Client may send ``subscribe`` / ``unsubscribe`` / ``ping``.
    Optional ``?topics=`` filters the client to a subset of bridged topics.
    Server emits ``heartbeat`` when idle for ``ws_heartbeat_seconds``.
    """
    container = websocket.app.state.container
    hub: WsHub = container.resolve("ws_hub")
    config: ServiceConfig = container.resolve("config")
    bridge: EventBridge = container.resolve("event_bridge")
    logger: logging.Logger = container.resolve("logger")

    await hub.connect(websocket)
    initial_filter = _parse_topics_query(topics)
    if initial_filter:
        hub.set_topics(websocket, initial_filter)

    subscribed = (
        bridge.subscribed_topics
        if bridge.subscribed_topics
        else list(config.event_subscribe_topics)
    )
    hello = WsServerMessage(
        type="hello",
        ts=datetime.now(timezone.utc),
        event_name=None,
        payload={
            "service": config.service_name,
            "subscribed_topics": subscribed,
        },
    )
    await websocket.send_json(hello.model_dump(mode="json"))
    log_event(
        logger,
        event="ecc.ws.connected",
        message="WebSocket client connected",
        clients=hub.client_count(),
    )

    heartbeat = max(1, int(config.ws_heartbeat_seconds))
    try:
        while True:
            try:
                raw = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=float(heartbeat),
                )
            except TimeoutError:
                ping = WsServerMessage(
                    type="heartbeat",
                    ts=datetime.now(timezone.utc),
                    event_name=None,
                    payload={"interval_seconds": heartbeat},
                )
                await websocket.send_json(ping.model_dump(mode="json"))
                continue

            try:
                msg = WsClientMessage.model_validate(raw)
            except ValidationError:
                err = WsServerMessage(
                    type="error",
                    ts=datetime.now(timezone.utc),
                    event_name=None,
                    payload={
                        "error_code": "ECC_WS_INVALID_MESSAGE",
                        "message": "Invalid client message",
                    },
                )
                await websocket.send_json(err.model_dump(mode="json"))
                continue

            if msg.type == "ping":
                pong = WsServerMessage(
                    type="heartbeat",
                    ts=datetime.now(timezone.utc),
                    event_name=None,
                    payload={"pong": True},
                )
                await websocket.send_json(pong.model_dump(mode="json"))
            elif msg.type == "subscribe":
                hub.set_topics(websocket, list(msg.topics))
            elif msg.type == "unsubscribe":
                hub.clear_topics(websocket)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 — connection teardown
        log_event(
            logger,
            event="ecc.ws.client_error",
            message="WebSocket client error",
            level=logging.WARNING,
        )
    finally:
        await hub.disconnect(websocket)
        log_event(
            logger,
            event="ecc.ws.disconnected",
            message="WebSocket client disconnected",
            clients=hub.client_count(),
        )
