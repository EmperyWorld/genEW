"""Redis EventBus factory and in-memory parity tests."""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from core.event_bus import (
    Event,
    EventBus,
    RedisEventBus,
    create_event_bus,
)


def test_create_event_bus_defaults_to_memory(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EVENT_BUS_REDIS_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    bus = create_event_bus()
    assert isinstance(bus, EventBus)
    assert not isinstance(bus, RedisEventBus)


def test_create_event_bus_requires_redis_without_opt_in(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("EVENT_BUS_REDIS_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.delenv("EVENT_BUS_ALLOW_IN_MEMORY", raising=False)
    with pytest.raises(RuntimeError, match="Redis EventBus is required"):
        create_event_bus()


def test_create_event_bus_selects_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EVENT_BUS_REDIS_URL", "redis://localhost:6379/0")
    bus = create_event_bus()
    assert isinstance(bus, RedisEventBus)


def test_memory_bus_start_stop_noop() -> None:
    bus = EventBus()
    asyncio.run(bus.start())
    asyncio.run(bus.stop())


@pytest.mark.asyncio
async def test_redis_event_bus_publish_dispatches_via_listener(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Simulate Redis pub/sub without a live server."""
    monkeypatch.setenv("EVENT_BUS_REDIS_CHANNEL", "empery.test")

    published: list[str] = []
    seen: list[str] = []

    class FakePubSub:
        def __init__(self) -> None:
            self._queue: asyncio.Queue = asyncio.Queue()

        async def subscribe(self, channel: str) -> None:
            assert channel == "empery.test"

        async def unsubscribe(self, channel: str) -> None:
            return None

        async def aclose(self) -> None:
            return None

        async def listen(self):
            while True:
                item = await self._queue.get()
                yield item

        def push(self, data: str) -> None:
            self._queue.put_nowait(
                {"type": "message", "data": data, "channel": "empery.test"}
            )

    pubsub = FakePubSub()

    class FakeRedis:
        def pubsub(self) -> FakePubSub:
            return pubsub

        async def publish(self, channel: str, body: str) -> int:
            published.append(body)
            pubsub.push(body)
            return 1

        async def aclose(self) -> None:
            return None

    fake = FakeRedis()

    with patch("redis.asyncio.from_url", return_value=fake):
        bus = RedisEventBus("redis://fake:6379/0", channel="empery.test")

        async def handler(event: Event) -> None:
            seen.append(event.name)

        bus.subscribe("task.created", handler)
        await bus.start()
        await bus.publish(Event(name="task.created", payload={"id": "1"}))
        # Allow listener task to process
        for _ in range(20):
            if seen:
                break
            await asyncio.sleep(0.05)
        await bus.stop()

    assert published
    assert seen == ["task.created"]


def test_event_from_legacy_redis_payload() -> None:
    from core.event_bus import _event_from_redis_payload

    event = _event_from_redis_payload(
        {"name": "task.created", "payload": {"task_id": "1"}}
    )
    assert event.name == "task.created"
    assert event.payload == {"task_id": "1"}
    assert event.occurred_at is None
    assert event.source is None
    assert event.schema_version == "1"


def test_event_enriched_fields_round_trip_dict() -> None:
    from core.event_bus import Event, _event_from_redis_payload

    original = Event(
        name="task.insight.generated",
        payload={"task_id": "abc", "provider": "llama_cpp"},
        occurred_at="2026-07-20T12:00:00+00:00",
        source="intelligence_service",
        schema_version="1",
    )
    body = {
        "name": original.name,
        "payload": dict(original.payload),
        "occurred_at": original.occurred_at,
        "source": original.source,
        "schema_version": original.schema_version,
    }
    restored = _event_from_redis_payload(body)
    assert restored.name == original.name
    assert restored.payload == original.payload
    assert restored.occurred_at == original.occurred_at
    assert restored.source == original.source
    assert restored.schema_version == "1"


@pytest.mark.asyncio
async def test_redis_publish_includes_envelope_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EVENT_BUS_REDIS_CHANNEL", "empery.test.meta")
    published: list[str] = []

    class FakePubSub:
        async def subscribe(self, channel: str) -> None:
            return None

        async def unsubscribe(self, channel: str) -> None:
            return None

        async def aclose(self) -> None:
            return None

        async def listen(self):
            if False:  # pragma: no cover
                yield {}

    class FakeRedis:
        def pubsub(self) -> FakePubSub:
            return FakePubSub()

        async def publish(self, channel: str, body: str) -> int:
            published.append(body)
            return 1

        async def aclose(self) -> None:
            return None

    with patch("redis.asyncio.from_url", return_value=FakeRedis()):
        bus = RedisEventBus("redis://fake:6379/0", channel="empery.test.meta")
        await bus.start()
        await bus.publish(
            Event(
                name="task.created",
                payload={"id": "1"},
                occurred_at="2026-07-20T12:00:00+00:00",
                source="task_orchestrator_service",
            )
        )
        await bus.stop()

    import json

    assert published
    data = json.loads(published[0])
    assert data["source"] == "task_orchestrator_service"
    assert data["occurred_at"] == "2026-07-20T12:00:00+00:00"
    assert data["schema_version"] == "1"
