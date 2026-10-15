"""Analytics service use cases."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from core.container import ServiceContainer
from core.event_bus import Event
from core.logging import log_event
from services.analytics_service.src.core.contracts import AnalyticsRepositoryPort
from services.analytics_service.src.core.models import AnalyticsEvent
from services.analytics_service.src.data.schemas import (
    AggregateByTypeItem,
    AggregateByTypeResponse,
    EventListResponse,
    IngestEventRequest,
    IngestEventResponse,
)


class AnalyticsUseCases:
    """Application services for analytics ingest and query workflows."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: AnalyticsRepositoryPort = container.resolve("analytics_repository")
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    async def ingest_event(self, request: IngestEventRequest) -> IngestEventResponse:
        now = datetime.now(timezone.utc)
        occurred_at = request.occurred_at or now
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)

        event = AnalyticsEvent(
            id=uuid4(),
            event_type=request.event_type,
            source=request.source,
            user_id=request.user_id,
            payload=dict(request.payload),
            occurred_at=occurred_at,
            ingested_at=now,
        )
        saved = await self._repo.insert_event(event)
        log_event(
            self._logger,
            event="analytics.ingest.success",
            message="Analytics event ingested",
            event_id=str(saved.id),
            event_type=saved.event_type,
        )
        await self._event_bus.publish(
            Event(
                name="analytics.event.ingested",
                payload={
                    "event_id": str(saved.id),
                    "event_type": saved.event_type,
                    "source": saved.source,
                    "user_id": str(saved.user_id) if saved.user_id else None,
                },
            )
        )
        return IngestEventResponse(event=saved)

    async def list_events(
        self,
        *,
        limit: int,
        event_type: str | None,
    ) -> EventListResponse:
        events = await self._repo.list_events(limit=limit, event_type=event_type)
        return EventListResponse(events=events, count=len(events))

    async def aggregate_by_type(
        self,
        *,
        event_type: str | None,
    ) -> AggregateByTypeResponse:
        buckets = await self._repo.count_by_event_type(event_type=event_type)
        items = [
            AggregateByTypeItem(event_type=name, count=count)
            for name, count in buckets
        ]
        total = sum(item.count for item in items)
        return AggregateByTypeResponse(items=items, total_events=total)
