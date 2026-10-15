"""Repository-level tests against sqlite DatabaseManager."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from uuid import uuid4

from core.data.database import DatabaseManager
from services.intelligence_service.src.core.models import TaskInsight
from services.intelligence_service.src.data.orm import Base
from services.intelligence_service.src.data.repository import InsightRepository


def _repository() -> InsightRepository:
    db = DatabaseManager.from_url("sqlite+pysqlite:///:memory:")
    db.create_all(Base.metadata)
    logger = logging.getLogger("test_insight_db")
    return InsightRepository(db, logger)


def _insight(task_id=None, *, priority: str = "medium", summary: str = "s") -> TaskInsight:
    now = datetime.now(timezone.utc)
    return TaskInsight(
        id=uuid4(),
        task_id=task_id or uuid4(),
        suggested_priority=priority,
        suggested_deadline=None,
        summary=summary,
        confidence=0.85,
        source="manual",
        raw_ai={"k": "v"},
        generated_at=now,
        updated_at=now,
    )


def test_upsert_and_get_by_task_id() -> None:
    repository = _repository()
    task_id = uuid4()

    async def _run() -> None:
        first = await repository.upsert_insight(
            _insight(task_id, priority="low", summary="first")
        )
        loaded = await repository.get_by_task_id(task_id)
        assert loaded is not None
        assert loaded.id == first.id
        assert loaded.suggested_priority == "low"
        assert loaded.summary == "first"

        second = await repository.upsert_insight(
            _insight(task_id, priority="high", summary="second")
        )
        assert second.id == first.id  # stable id on upsert
        assert second.suggested_priority == "high"
        assert second.summary == "second"

        again = await repository.get_by_task_id(task_id)
        assert again is not None
        assert again.suggested_priority == "high"
        assert again.raw_ai == {"k": "v"}

        missing = await repository.get_by_task_id(uuid4())
        assert missing is None

    asyncio.run(_run())
