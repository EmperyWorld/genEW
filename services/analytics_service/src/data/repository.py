"""Analytics data repository backed by DatabaseManager / SQLAlchemy."""

from __future__ import annotations

import logging
from datetime import timezone

from sqlalchemy import func, select

from core.data.database import DatabaseManager
from core.logging import log_event
from services.analytics_service.src.core.models import AnalyticsEvent
from services.analytics_service.src.data.orm import EventRow


class AnalyticsRepository:
    """Postgres/SQLite-backed data-access boundary for analytics events."""

    def __init__(self, database: DatabaseManager, logger: logging.Logger) -> None:
        self._db = database
        self._logger = logger

    def _to_event(self, row: EventRow) -> AnalyticsEvent:
        occurred = row.occurred_at
        if occurred.tzinfo is None:
            occurred = occurred.replace(tzinfo=timezone.utc)
        ingested = row.ingested_at
        if ingested.tzinfo is None:
            ingested = ingested.replace(tzinfo=timezone.utc)
        return AnalyticsEvent(
            id=row.id,  # type: ignore[arg-type]
            event_type=row.event_type,
            source=row.source,
            user_id=row.user_id,  # type: ignore[arg-type]
            payload=dict(row.payload_json or {}),
            occurred_at=occurred,
            ingested_at=ingested,
        )

    async def insert_event(self, event: AnalyticsEvent) -> AnalyticsEvent:
        with self._db.session_scope() as session:
            row = EventRow(
                id=event.id,
                event_type=event.event_type,
                source=event.source,
                user_id=event.user_id,
                payload_json=dict(event.payload),
                occurred_at=event.occurred_at,
                ingested_at=event.ingested_at,
            )
            session.add(row)
            session.flush()
            saved = self._to_event(row)
        log_event(
            self._logger,
            event="analytics.repo.event_inserted",
            message="Analytics event persisted",
            event_id=str(saved.id),
            event_type=saved.event_type,
        )
        return saved

    async def list_events(
        self,
        *,
        limit: int,
        event_type: str | None,
    ) -> list[AnalyticsEvent]:
        with self._db.session_scope() as session:
            stmt = select(EventRow).order_by(EventRow.ingested_at.desc()).limit(limit)
            if event_type is not None:
                stmt = stmt.where(EventRow.event_type == event_type)
            rows = session.scalars(stmt).all()
            return [self._to_event(row) for row in rows]

    async def count_by_event_type(
        self,
        *,
        event_type: str | None,
    ) -> list[tuple[str, int]]:
        with self._db.session_scope() as session:
            stmt = select(
                EventRow.event_type,
                func.count().label("count"),
            ).group_by(EventRow.event_type)
            if event_type is not None:
                stmt = stmt.where(EventRow.event_type == event_type)
            stmt = stmt.order_by(func.count().desc())
            rows = session.execute(stmt).all()
            return [(str(event_type_), int(count)) for event_type_, count in rows]
