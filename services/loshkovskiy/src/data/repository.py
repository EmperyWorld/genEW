"""Postgres-backed metric repository for loshkovskiy."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from core.data.database import DatabaseManager
from services.loshkovskiy.src.data.orm import MetricRow
from services.loshkovskiy.src.data.schemas import MetricCreate, MetricView


class MetricRepository:
    def __init__(self, database: DatabaseManager) -> None:
        self._db = database

    def _to_view(self, row: MetricRow) -> MetricView:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        updated = row.updated_at
        if updated is not None and updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        return MetricView(
            id=row.id,  # type: ignore[arg-type]
            label=row.label,
            value=row.value,
            unit=row.unit,
            updated_at=updated,
            created_at=created,
        )

    async def create(self, payload: MetricCreate) -> MetricView:
        with self._db.session_scope() as session:
            now = datetime.now(timezone.utc)
            row = MetricRow(
                label=payload.label,
                value=payload.value,
                unit=payload.unit,
                updated_at=now,
            )
            session.add(row)
            session.flush()
            return self._to_view(row)

    async def list_items(self, *, limit: int = 50) -> list[MetricView]:
        with self._db.session_scope() as session:
            rows = list(
                session.scalars(
                    select(MetricRow)
                    .order_by(MetricRow.created_at.desc())
                    .limit(max(1, min(limit, 200)))
                ).all()
            )
            return [self._to_view(r) for r in rows]
