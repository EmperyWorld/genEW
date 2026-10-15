"""Application use cases for loshkovskiy."""

from __future__ import annotations

from core.container import ServiceContainer
from core.event_bus import Event
from core.logging import log_event

from services.loshkovskiy.src.core.contracts import MetricRepositoryPort
from services.loshkovskiy.src.data.schemas import (
    MetricCreate,
    MetricListResponse,
    MetricView,
)


class LoshkovskiyUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: MetricRepositoryPort = container.resolve("metric_repository")
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    async def create_metric(self, payload: MetricCreate) -> MetricView:
        item = await self._repo.create(payload)
        log_event(
            self._logger,
            event="metric.metric.created",
            message="Metric created",
            item_id=str(item.id),
            label=item.label,
        )
        await self._event_bus.publish(
            Event(
                name="metric.metric.created",
                payload={"item_id": str(item.id), "label": item.label},
            )
        )
        return item

    async def list_metrics(self, *, limit: int = 50) -> MetricListResponse:
        items = await self._repo.list_items(limit=limit)
        return MetricListResponse(metrics=items, count=len(items))
