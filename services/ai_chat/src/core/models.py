"""Companion chat domain models."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ChatMessage(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID = Field(default_factory=uuid4)
    user_id: UUID | None = None
    role: str
    content: str
    created_at: datetime = Field(default_factory=_utcnow)
    session_id: UUID | None = None
