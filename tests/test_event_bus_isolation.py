"""EventBus per-handler error isolation."""

from __future__ import annotations

import asyncio

from core.event_bus import Event, EventBus


def test_failing_handler_does_not_block_siblings() -> None:
    bus = EventBus()
    seen: list[str] = []

    def failing(_event: Event) -> None:
        seen.append("failing")
        raise RuntimeError("handler boom")

    def succeeding(_event: Event) -> None:
        seen.append("succeeding")

    bus.subscribe("demo.event", failing)
    bus.subscribe("demo.event", succeeding)

    asyncio.run(bus.publish(Event(name="demo.event", payload={"ok": True})))

    assert seen == ["failing", "succeeding"]


def test_async_failing_handler_isolation() -> None:
    bus = EventBus()
    seen: list[str] = []

    async def failing(_event: Event) -> None:
        seen.append("async_fail")
        raise ValueError("async boom")

    async def succeeding(_event: Event) -> None:
        seen.append("async_ok")

    bus.subscribe("demo.async", failing)
    bus.subscribe("demo.async", succeeding)

    asyncio.run(bus.publish(Event(name="demo.async", payload={})))

    assert seen == ["async_fail", "async_ok"]
