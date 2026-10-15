"""Postgres/SQLite-backed chat store for dedmoroz."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select

from core.data.database import DatabaseManager
from services.dedmoroz.src.core.models import ChatMessage
from services.dedmoroz.src.data.orm import ChatMessageRow


class ChatMessageRepository:
    def __init__(self, database: DatabaseManager) -> None:
        self._db = database

    def _to_message(self, row: ChatMessageRow) -> ChatMessage:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return ChatMessage(
            id=row.id,  # type: ignore[arg-type]
            role=row.role,
            content=row.content,
            created_at=created,
        )

    async def append(self, role: str, content: str) -> ChatMessage:
        with self._db.session_scope() as session:
            row = ChatMessageRow(
                id=uuid4(),
                role=role,
                content=content,
                created_at=datetime.now(timezone.utc),
            )
            session.add(row)
            session.flush()
            return self._to_message(row)

    async def list(self, *, limit: int = 50) -> list[ChatMessage]:
        with self._db.session_scope() as session:
            rows = session.scalars(
                select(ChatMessageRow)
                .order_by(ChatMessageRow.created_at.asc())
                .limit(max(1, min(limit, 500)))
            ).all()
            return [self._to_message(r) for r in rows]
