"""API request/response schemas (Pydantic V2)."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.analytics_service.src.core.models import AnalyticsEvent


class IngestEventRequest(BaseModel):
    """Single analytics event ingest payload."""

    model_config = ConfigDict(frozen=True)

    event_type: str = Field(min_length=1, max_length=128)
    source: str | None = Field(default=None, max_length=128)
    user_id: UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime | None = None


class IngestEventResponse(BaseModel):
    """Successful ingest payload."""

    model_config = ConfigDict(frozen=True)

    event: AnalyticsEvent


class EventListResponse(BaseModel):
    """List of recent analytics events."""

    model_config = ConfigDict(frozen=True)

    events: list[AnalyticsEvent]
    count: int


class AggregateByTypeItem(BaseModel):
    """Count bucket for a single event_type."""

    model_config = ConfigDict(frozen=True)

    event_type: str
    count: int


class AggregateByTypeResponse(BaseModel):
    """Aggregate counts grouped by event_type."""

    model_config = ConfigDict(frozen=True)

    items: list[AggregateByTypeItem]
    total_events: int


class HealthResponse(BaseModel):
    """Service health contract."""

    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str]
    database_ready: bool = False
