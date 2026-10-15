"""API schemas for ops dashboard metrics."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str] = Field(default_factory=list)


class MetricCreate(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    value: str = Field(min_length=1, max_length=200)
    unit: str | None = None


class MetricView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    label: str
    value: str
    unit: str | None = None
    updated_at: datetime | None = None
    created_at: datetime


class MetricListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    metrics: list[MetricView]
    count: int
