"""Companion chat API schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class MessageResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    role: str
    content: str
    created_at: datetime


class MessageListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    messages: list[MessageResponse]
    count: int
