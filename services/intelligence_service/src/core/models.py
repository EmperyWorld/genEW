"""Immutable core domain entities."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TaskInsight(BaseModel):
    """Immutable AI insight attached to a task."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    task_id: UUID
    suggested_priority: str
    suggested_deadline: datetime | None = None
    summary: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: str
    raw_ai: dict[str, Any] = Field(default_factory=dict)
    generated_at: datetime
    updated_at: datetime
