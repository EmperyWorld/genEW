"""Event Bus flow: task.created → persist insight → task.insight.generated."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from core.event_bus import Event
from services.intelligence_service.tests.conftest import build_intelligence_app


def _app(**overrides):
    return build_intelligence_app(subscribe_task_updated=True, **overrides)


def test_task_created_publishes_insight_generated() -> None:
    app = _app()
    task_id = uuid4()
    created_by = uuid4()
    received: list[Event] = []

    async def _capture(event: Event) -> None:
        received.append(event)

    with TestClient(app) as client:
        bus = app.state.container.resolve("event_bus")
        bus.subscribe("task.insight.generated", _capture)
        repo = app.state.container.resolve("insight_repository")

        async def _run() -> None:
            await bus.publish(
                Event(
                    name="task.created",
                    payload={
                        "task_id": str(task_id),
                        "title": "Important blocker for release",
                        "description": "Needs high attention",
                        "assignee_id": str(created_by),
                        "status": "todo",
                        "priority": "medium",
                        "created_by": str(created_by),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
            )
            return await repo.get_by_task_id(task_id)

        insight = asyncio.run(_run())
        assert insight is not None
        assert insight.task_id == task_id
        assert insight.suggested_priority == "high"
        assert insight.source == "event"

        assert len(received) == 1
        payload = received[0].payload
        assert set(payload.keys()) >= {
            "task_id",
            "insight_id",
            "suggested_priority",
            "suggested_deadline",
            "summary",
            "confidence",
            "generated_at",
            "provider",
            "model",
        }
        assert payload["task_id"] == str(task_id)
        assert payload["insight_id"] == str(insight.id)
        assert payload["suggested_priority"] == insight.suggested_priority
        assert payload["confidence"] == insight.confidence
        assert payload["provider"] == insight.raw_ai.get("provider")
        assert received[0].source == "intelligence_service"

        # Insight also visible via REST after event processing.
        response = client.get(f"/api/v1/insights/{task_id}")
        assert response.status_code == 200
        assert response.json()["insight"]["id"] == str(insight.id)


def test_invalid_task_created_does_not_publish() -> None:
    app = _app()
    received: list[Event] = []

    async def _capture(event: Event) -> None:
        received.append(event)

    with TestClient(app):
        bus = app.state.container.resolve("event_bus")
        bus.subscribe("task.insight.generated", _capture)

        async def _run() -> None:
            await bus.publish(
                Event(
                    name="task.created",
                    payload={"title": "missing task_id"},
                )
            )

        asyncio.run(_run())
        assert received == []
