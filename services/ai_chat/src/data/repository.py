"""Postgres-backed chat store using existing chat_sessions / chat_messages."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import func, select

from core.data.database import DatabaseManager
from services.ai_chat.src.core.models import ChatMessage
from services.ai_chat.src.data.orm import ChatMessageRow, ChatSessionRow


class ChatMessageRepository:
    def __init__(self, database: DatabaseManager) -> None:
        self._db = database

    def _to_message(self, row: ChatMessageRow) -> ChatMessage:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        meta = row.metadata_json if isinstance(row.metadata_json, dict) else {}
        user_id = meta.get("user_id")
        return ChatMessage(
            id=row.id,  # type: ignore[arg-type]
            user_id=UUID(str(user_id)) if user_id else None,
            role=row.role,
            content=row.content,
            created_at=created,
            session_id=row.session_id,  # type: ignore[arg-type]
        )

    def _ensure_session(self, session, owner_id: UUID) -> UUID:
        row = session.scalar(
            select(ChatSessionRow)
            .where(ChatSessionRow.owner_id == owner_id)
            .where(ChatSessionRow.status == "active")
            .order_by(ChatSessionRow.updated_at.desc())
            .limit(1)
        )
        if row is not None:
            return row.id  # type: ignore[return-value]
        sid = uuid4()
        now = datetime.now(timezone.utc)
        session.add(
            ChatSessionRow(
                id=sid,
                title="default",
                status="active",
                owner_id=owner_id,
                created_at=now,
                updated_at=now,
            )
        )
        session.flush()
        return sid

    async def append(
        self,
        role: str,
        content: str,
        *,
        user_id: UUID | None = None,
        session_id: UUID | None = None,
    ) -> ChatMessage:
        if user_id is None:
            raise ValueError("user_id required for durable chat store")
        with self._db.session_scope() as session:
            sid = session_id or self._ensure_session(session, user_id)
            next_seq = session.scalar(
                select(func.coalesce(func.max(ChatMessageRow.sequence), 0)).where(
                    ChatMessageRow.session_id == sid
                )
            )
            seq = int(next_seq or 0) + 1
            row = ChatMessageRow(
                session_id=sid,
                role=role,
                content=content,
                sequence=seq,
                metadata_json={"user_id": str(user_id)},
            )
            session.add(row)
            sess = session.get(ChatSessionRow, sid)
            if sess is not None:
                sess.updated_at = datetime.now(timezone.utc)
            session.flush()
            return self._to_message(row)

    async def list(
        self,
        *,
        limit: int = 50,
        user_id: UUID | None = None,
    ) -> list[ChatMessage]:
        if user_id is None:
            return []
        with self._db.session_scope() as session:
            sid = session.scalar(
                select(ChatSessionRow.id)
                .where(ChatSessionRow.owner_id == user_id)
                .where(ChatSessionRow.status == "active")
                .order_by(ChatSessionRow.updated_at.desc())
                .limit(1)
            )
            if sid is None:
                return []
            rows = list(
                session.scalars(
                    select(ChatMessageRow)
                    .where(ChatMessageRow.session_id == sid)
                    .order_by(ChatMessageRow.sequence.asc())
                ).all()
            )
            sliced = rows[-limit:]
            return [self._to_message(r) for r in sliced]
