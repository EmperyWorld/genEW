"""Companion chat domain models for dedmoroz."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID = Field(default_factory=uuid4)
    role: str
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
