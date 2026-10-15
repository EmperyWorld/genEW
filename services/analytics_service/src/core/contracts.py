"""Interface contracts for the analytics service provider pattern."""

from __future__ import annotations

from typing import Protocol

from services.analytics_service.src.core.models import AnalyticsEvent


class AnalyticsRepositoryPort(Protocol):
    """Data-access contract resolved via ServiceContainer."""

    async def insert_event(self, event: AnalyticsEvent) -> AnalyticsEvent: ...

    async def list_events(
        self,
        *,
        limit: int,
        event_type: str | None,
    ) -> list[AnalyticsEvent]: ...

    async def count_by_event_type(
        self,
        *,
        event_type: str | None,
    ) -> list[tuple[str, int]]: ...
