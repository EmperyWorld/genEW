"""Immutable domain models for ops dashboard metrics."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class Metric(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    label: str
    value: str
    unit: str | None = None
    updated_at: datetime | None = None
    created_at: datetime
