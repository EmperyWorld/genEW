"""Insight data repository backed by DatabaseManager / SQLAlchemy."""

from __future__ import annotations

import logging
from datetime import timezone
from uuid import UUID

from sqlalchemy import select

from core.data.database import DatabaseManager
from core.logging import log_event
from services.intelligence_service.src.core.models import TaskInsight
from services.intelligence_service.src.data.orm import TaskInsightRow


class InsightRepository:
    """Postgres/SQLite-backed data-access boundary for task insights."""

    def __init__(self, database: DatabaseManager, logger: logging.Logger) -> None:
        self._db = database
        self._logger = logger

    def _to_insight(self, row: TaskInsightRow) -> TaskInsight:
        generated = row.generated_at
        if generated.tzinfo is None:
            generated = generated.replace(tzinfo=timezone.utc)
        updated = row.updated_at
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        deadline = row.suggested_deadline
        if deadline is not None and deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        return TaskInsight(
            id=row.id,  # type: ignore[arg-type]
            task_id=row.task_id,  # type: ignore[arg-type]
            suggested_priority=row.suggested_priority,
            suggested_deadline=deadline,
            summary=row.summary,
            confidence=float(row.confidence),
            source=row.source,
            raw_ai=dict(row.raw_ai_json or {}),
            generated_at=generated,
            updated_at=updated,
        )

    async def upsert_insight(self, insight: TaskInsight) -> TaskInsight:
        with self._db.session_scope() as session:
            existing = session.scalar(
                select(TaskInsightRow).where(TaskInsightRow.task_id == insight.task_id)
            )
            if existing is None:
                row = TaskInsightRow(
                    id=insight.id,
                    task_id=insight.task_id,
                    suggested_priority=insight.suggested_priority,
                    suggested_deadline=insight.suggested_deadline,
                    summary=insight.summary,
                    confidence=insight.confidence,
                    source=insight.source,
                    raw_ai_json=dict(insight.raw_ai),
                    generated_at=insight.generated_at,
                    updated_at=insight.updated_at,
                )
                session.add(row)
            else:
                # Stable row id; overwrite analysis fields for this task_id.
                existing.suggested_priority = insight.suggested_priority
                existing.suggested_deadline = insight.suggested_deadline
                existing.summary = insight.summary
                existing.confidence = insight.confidence
                existing.source = insight.source
                existing.raw_ai_json = dict(insight.raw_ai)
                existing.generated_at = insight.generated_at
                existing.updated_at = insight.updated_at
                row = existing
            session.flush()
            saved = self._to_insight(row)
        log_event(
            self._logger,
            event="intelligence.repo.upsert",
            message="Task insight upserted",
            insight_id=str(saved.id),
            task_id=str(saved.task_id),
        )
        return saved

    async def get_by_task_id(self, task_id: UUID) -> TaskInsight | None:
        with self._db.session_scope() as session:
            row = session.scalar(
                select(TaskInsightRow).where(TaskInsightRow.task_id == task_id)
            )
            if row is None:
                return None
            return self._to_insight(row)
