"""Pydantic contracts for ECC → ai_chat chat BFF."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EccSendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class EccMessageView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    role: str
    content: str
    created_at: datetime


class EccMessageListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    messages: list[EccMessageView]
    count: int
