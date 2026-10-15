"""Repository-level tests against sqlite DatabaseManager."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from uuid import uuid4

from core.data.database import DatabaseManager
from services.analytics_service.src.core.models import AnalyticsEvent
from services.analytics_service.src.data.orm import Base
from services.analytics_service.src.data.repository import AnalyticsRepository


def _repository() -> AnalyticsRepository:
    db = DatabaseManager.from_url("sqlite+pysqlite:///:memory:")
    db.create_all(Base.metadata)
    logger = logging.getLogger("test_analytics_db")
    return AnalyticsRepository(db, logger)


def _event(event_type: str, *, source: str | None = "web") -> AnalyticsEvent:
    now = datetime.now(timezone.utc)
    return AnalyticsEvent(
        id=uuid4(),
        event_type=event_type,
        source=source,
        user_id=None,
        payload={"k": "v"},
        occurred_at=now,
        ingested_at=now,
    )


def test_insert_and_list_events() -> None:
    repository = _repository()

    async def _run() -> None:
        first = await repository.insert_event(_event("page_view"))
        second = await repository.insert_event(_event("click"))

        events = await repository.list_events(limit=50, event_type=None)
        assert len(events) == 2
        assert {e.id for e in events} == {first.id, second.id}

        filtered = await repository.list_events(limit=50, event_type="click")
        assert len(filtered) == 1
        assert filtered[0].id == second.id
        assert filtered[0].payload == {"k": "v"}

    asyncio.run(_run())


def test_count_by_event_type() -> None:
    repository = _repository()

    async def _run() -> None:
        await repository.insert_event(_event("page_view"))
        await repository.insert_event(_event("page_view"))
        await repository.insert_event(_event("click"))

        all_counts = await repository.count_by_event_type(event_type=None)
        assert dict(all_counts) == {"page_view": 2, "click": 1}
        assert all_counts[0][1] >= all_counts[-1][1]

        click_only = await repository.count_by_event_type(event_type="click")
        assert click_only == [("click", 1)]

    asyncio.run(_run())
