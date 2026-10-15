"""Immutable core domain entities."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AnalyticsEvent(BaseModel):
    """Immutable analytics event entity."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    event_type: str
    source: str | None = None
    user_id: UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime
    ingested_at: datetime
