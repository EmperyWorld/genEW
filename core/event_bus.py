"""Pub/sub event bus — in-process default, optional Redis for multi-container."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import BaseModel, ConfigDict

_logger = logging.getLogger("core.event_bus")

DEFAULT_REDIS_CHANNEL = "empery.events"


class Event(BaseModel):
    """Immutable event envelope for async communication."""

    model_config = ConfigDict(frozen=True)

    name: str
    payload: dict[str, Any] = {}
    # Wave 2 additive metadata — legacy {name, payload} still deserializes.
    occurred_at: str | None = None
    source: str | None = None
    schema_version: str = "1"


EventHandler = Callable[[Event], Awaitable[None] | None]


def _event_from_redis_payload(parsed: dict[str, Any]) -> Event:
    """Deserialize Redis JSON; tolerate legacy {name, payload}-only bodies."""
    kwargs: dict[str, Any] = {
        "name": str(parsed.get("name", "")),
        "payload": dict(parsed.get("payload") or {}),
    }
    if parsed.get("occurred_at") is not None:
        kwargs["occurred_at"] = str(parsed["occurred_at"])
    if parsed.get("source") is not None:
        kwargs["source"] = str(parsed["source"])
    if parsed.get("schema_version") is not None:
        kwargs["schema_version"] = str(parsed["schema_version"])
    return Event(**kwargs)


async def _dispatch(handlers: list[EventHandler], event: Event) -> None:
    """Invoke handlers with per-handler exception isolation."""
    for handler in list(handlers):
        try:
            result = handler(event)
            if hasattr(result, "__await__"):
                await result  # type: ignore[misc]
        except Exception:
            _logger.exception(
                "event handler failed",
                extra={
                    "event": "event_bus.handler_error",
                    "extra_fields": {
                        "event_name": event.name,
                        "handler": getattr(handler, "__qualname__", repr(handler)),
                    },
                },
            )


class EventBus:
    """In-process publish/subscribe bus (local/dev/tests)."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[EventHandler]] = defaultdict(list)

    def subscribe(self, event_name: str, handler: EventHandler) -> None:
        self._subscribers[event_name].append(handler)

    def unsubscribe(self, event_name: str, handler: EventHandler) -> None:
        handlers = self._subscribers.get(event_name)
        if not handlers:
            return
        self._subscribers[event_name] = [h for h in handlers if h is not handler]

    async def publish(self, event: Event) -> None:
        """Deliver ``event`` to all local subscribers for ``event.name``."""
        await _dispatch(self._subscribers.get(event.name, []), event)

    async def start(self) -> None:
        """No-op — present for interface parity with RedisEventBus."""

    async def stop(self) -> None:
        """No-op — present for interface parity with RedisEventBus."""


class RedisEventBus:
    """
    Redis pub/sub EventBus for cross-container delivery.

    ``subscribe`` registers in-process handlers. ``publish`` serializes to Redis;
    a background listener deserializes and dispatches to local handlers.
    """

    def __init__(
        self,
        redis_url: str,
        *,
        channel: str | None = None,
    ) -> None:
        self._redis_url = redis_url
        self._channel = channel or os.environ.get(
            "EVENT_BUS_REDIS_CHANNEL", DEFAULT_REDIS_CHANNEL
        )
        self._subscribers: dict[str, list[EventHandler]] = defaultdict(list)
        self._publish_client: Any = None
        self._pubsub_client: Any = None
        self._pubsub: Any = None
        self._listener_task: asyncio.Task[None] | None = None
        self._started = False
        self._lock = asyncio.Lock()

    def subscribe(self, event_name: str, handler: EventHandler) -> None:
        self._subscribers[event_name].append(handler)

    def unsubscribe(self, event_name: str, handler: EventHandler) -> None:
        handlers = self._subscribers.get(event_name)
        if not handlers:
            return
        self._subscribers[event_name] = [h for h in handlers if h is not handler]

    async def start(self) -> None:
        async with self._lock:
            if self._started:
                return
            try:
                import redis.asyncio as redis_async
            except ImportError as exc:  # pragma: no cover
                raise RuntimeError(
                    "redis package required for RedisEventBus; pip install redis"
                ) from exc

            self._publish_client = redis_async.from_url(
                self._redis_url, decode_responses=True
            )
            self._pubsub_client = redis_async.from_url(
                self._redis_url, decode_responses=True
            )
            self._pubsub = self._pubsub_client.pubsub()
            await self._pubsub.subscribe(self._channel)
            self._listener_task = asyncio.create_task(
                self._listen_loop(),
                name="empery-redis-event-bus",
            )
            self._started = True
            _logger.info(
                "RedisEventBus started",
                extra={
                    "event": "event_bus.redis.started",
                    "extra_fields": {"channel": self._channel},
                },
            )

    async def stop(self) -> None:
        async with self._lock:
            if not self._started:
                return
            if self._listener_task is not None:
                self._listener_task.cancel()
                try:
                    await self._listener_task
                except asyncio.CancelledError:
                    pass
                self._listener_task = None
            if self._pubsub is not None:
                try:
                    await self._pubsub.unsubscribe(self._channel)
                    await self._pubsub.aclose()
                except Exception:  # noqa: BLE001
                    _logger.debug("pubsub close failed", exc_info=True)
                self._pubsub = None
            for client in (self._pubsub_client, self._publish_client):
                if client is not None:
                    try:
                        await client.aclose()
                    except Exception:  # noqa: BLE001
                        _logger.debug("redis client close failed", exc_info=True)
            self._pubsub_client = None
            self._publish_client = None
            self._started = False

    async def publish(self, event: Event) -> None:
        await self.start()
        assert self._publish_client is not None
        envelope: dict[str, Any] = {
            "name": event.name,
            "payload": dict(event.payload),
            "schema_version": event.schema_version or "1",
        }
        if event.occurred_at is not None:
            envelope["occurred_at"] = event.occurred_at
        if event.source is not None:
            envelope["source"] = event.source
        body = json.dumps(envelope, default=str)
        await self._publish_client.publish(self._channel, body)

    async def _listen_loop(self) -> None:
        """Read Redis pub/sub forever; reconnect with backoff on connection loss."""
        backoff = 0.5
        while True:
            try:
                if self._pubsub is None:
                    await self._resubscribe()
                assert self._pubsub is not None
                async for message in self._pubsub.listen():
                    backoff = 0.5
                    if message is None:
                        continue
                    if message.get("type") != "message":
                        continue
                    data = message.get("data")
                    if not isinstance(data, str):
                        continue
                    try:
                        parsed = json.loads(data)
                        event = _event_from_redis_payload(parsed)
                    except (json.JSONDecodeError, TypeError, ValueError):
                        _logger.warning(
                            "invalid redis event payload",
                            extra={
                                "event": "event_bus.redis.bad_payload",
                                "extra_fields": {"raw": data[:200]},
                            },
                        )
                        continue
                    if not event.name:
                        continue
                    await _dispatch(self._subscribers.get(event.name, []), event)
            except asyncio.CancelledError:
                raise
            except Exception:
                _logger.exception(
                    "RedisEventBus listener error; reconnecting",
                    extra={
                        "event": "event_bus.redis.listener_error",
                        "extra_fields": {"backoff_s": backoff},
                    },
                )
                await self._close_pubsub_only()
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 15.0)

    async def _resubscribe(self) -> None:
        import redis.asyncio as redis_async

        if self._pubsub_client is None:
            self._pubsub_client = redis_async.from_url(
                self._redis_url, decode_responses=True
            )
        self._pubsub = self._pubsub_client.pubsub()
        await self._pubsub.subscribe(self._channel)

    async def _close_pubsub_only(self) -> None:
        if self._pubsub is not None:
            try:
                await self._pubsub.aclose()
            except Exception:  # noqa: BLE001
                pass
            self._pubsub = None
        if self._pubsub_client is not None:
            try:
                await self._pubsub_client.aclose()
            except Exception:  # noqa: BLE001
                pass
            self._pubsub_client = None


def _allow_in_memory_event_bus() -> bool:
    raw = os.environ.get("EVENT_BUS_ALLOW_IN_MEMORY", "")
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def create_event_bus(
    redis_url: str | None = None,
    *,
    channel: str | None = None,
) -> EventBus | RedisEventBus:
    """
    Build an EventBus.

    Uses Redis when ``redis_url`` or ``EVENT_BUS_REDIS_URL`` / ``REDIS_URL``
    is set. In-memory ``EventBus`` is allowed **only** when
    ``EVENT_BUS_ALLOW_IN_MEMORY=true`` (tests). Production/compose must
    configure Redis or startup fails loudly.
    """
    url = redis_url
    if url is None:
        url = os.environ.get("EVENT_BUS_REDIS_URL") or os.environ.get("REDIS_URL")
    if url and url.strip():
        return RedisEventBus(url.strip(), channel=channel)
    if _allow_in_memory_event_bus():
        _logger.warning(
            "Using in-memory EventBus (EVENT_BUS_ALLOW_IN_MEMORY=true)",
            extra={"event": "event_bus.memory.opt_in"},
        )
        return EventBus()
    raise RuntimeError(
        "Redis EventBus is required: set EVENT_BUS_REDIS_URL or REDIS_URL. "
        "For tests only, opt in with EVENT_BUS_ALLOW_IN_MEMORY=true."
    )


async def ensure_event_bus_started(bus: Any) -> None:
    """Start Redis listener when present; no-op for in-memory bus."""
    start = getattr(bus, "start", None)
    if start is not None:
        await start()


async def ensure_event_bus_stopped(bus: Any) -> None:
    """Stop Redis listener when present; no-op for in-memory bus."""
    stop = getattr(bus, "stop", None)
    if stop is not None:
        await stop()
