"""Intelligence service use cases."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event
from core.logging import log_event
from services.intelligence_service.src.core.contracts import (
    InsightRepositoryPort,
    TaskInsightRequest,
)
from services.intelligence_service.src.core.models import TaskInsight
from services.intelligence_service.src.data.schemas import (
    AnalyzeTaskRequest,
    InsightResponse,
)
from services.intelligence_service.src.integration.ai_insight import analyze_task


class IntelligenceUseCases:
    """Application services for task insight analysis and event-driven flows."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: InsightRepositoryPort = container.resolve("insight_repository")
        self._ai = container.resolve("ai_provider")
        self._logger: logging.Logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    async def get_insight(self, task_id: UUID) -> InsightResponse:
        insight = await self._repo.get_by_task_id(task_id)
        if insight is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="INTELLIGENCE_NOT_FOUND",
                    message=f"No insight found for task_id={task_id}",
                    details={"task_id": str(task_id)},
                ),
                http_status=404,
            )
        return InsightResponse(insight=insight)

    async def analyze_manual(self, request: AnalyzeTaskRequest) -> InsightResponse:
        insight_request = TaskInsightRequest(
            task_id=request.task_id,
            title=request.title,
            description=request.description,
            current_priority=request.priority,
            assignee_id=request.assignee_id,
            metadata={"source": "manual"},
        )
        insight = await self._analyze_and_persist(insight_request, source="manual")
        return InsightResponse(insight=insight)

    async def handle_task_created(self, event: Event) -> None:
        log_event(
            self._logger,
            event="intelligence.event.task_created",
            message="Received task.created",
            payload_keys=sorted(event.payload.keys()),
        )
        try:
            insight_request = self._request_from_created_payload(event.payload)
        except ValueError as exc:
            log_event(
                self._logger,
                event="intelligence.event.invalid",
                message="Invalid task.created payload",
                level=logging.WARNING,
                reason=str(exc),
            )
            return
        try:
            await self._analyze_and_persist(insight_request, source="event")
        except ServiceError as exc:
            log_event(
                self._logger,
                event="intelligence.analyze.ai_error",
                message=exc.response.message,
                level=logging.ERROR,
                error_code=exc.response.error_code,
            )
        except Exception as exc:  # noqa: BLE001 — bus handlers must not crash
            log_event(
                self._logger,
                event="intelligence.analyze.ai_error",
                message="Unhandled error during task.created analysis",
                level=logging.ERROR,
                reason=str(exc),
            )

    async def handle_task_updated(self, event: Event) -> None:
        """
        Optional re-analysis when title/description are present.

        Canonical task.updated payloads may only include changed_fields;
        skip when analysis inputs are missing.
        """
        payload = event.payload
        title = payload.get("title")
        description = payload.get("description")
        if not title and not description:
            log_event(
                self._logger,
                event="intelligence.event.invalid",
                message="task.updated skipped — title/description absent",
                level=logging.INFO,
                task_id=str(payload.get("task_id")),
            )
            return
        try:
            task_id = UUID(str(payload["task_id"]))
        except (KeyError, TypeError, ValueError) as exc:
            log_event(
                self._logger,
                event="intelligence.event.invalid",
                message="Invalid task.updated payload",
                level=logging.WARNING,
                reason=str(exc),
            )
            return

        assignee_id = self._optional_uuid(payload.get("assignee_id"))
        insight_request = TaskInsightRequest(
            task_id=task_id,
            title=str(title or ""),
            description=str(description or ""),
            current_priority=(
                str(payload["priority"]) if payload.get("priority") else None
            ),
            assignee_id=assignee_id,
            metadata={"source": "event", "topic": "task.updated"},
        )
        try:
            await self._analyze_and_persist(insight_request, source="event")
        except ServiceError as exc:
            log_event(
                self._logger,
                event="intelligence.analyze.ai_error",
                message=exc.response.message,
                level=logging.ERROR,
                error_code=exc.response.error_code,
            )
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="intelligence.analyze.ai_error",
                message="Unhandled error during task.updated analysis",
                level=logging.ERROR,
                reason=str(exc),
            )

    async def _analyze_and_persist(
        self,
        request: TaskInsightRequest,
        *,
        source: str,
    ) -> TaskInsight:
        try:
            ai_result = await analyze_task(self._ai, request)
        except ServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="INTELLIGENCE_AI_ERROR",
                    message="AI analysis failed",
                    details={"reason": str(exc)},
                ),
                http_status=502,
            ) from exc

        now = datetime.now(timezone.utc)
        existing = await self._repo.get_by_task_id(request.task_id)
        insight_id = existing.id if existing is not None else uuid4()
        insight = TaskInsight(
            id=insight_id,
            task_id=request.task_id,
            suggested_priority=ai_result.suggested_priority,
            suggested_deadline=ai_result.suggested_deadline,
            summary=ai_result.summary,
            confidence=ai_result.confidence,
            source=source,
            raw_ai=dict(ai_result.raw),
            generated_at=now,
            updated_at=now,
        )
        saved = await self._repo.upsert_insight(insight)
        log_event(
            self._logger,
            event="intelligence.analyze.success",
            message="Task insight generated",
            task_id=str(saved.task_id),
            insight_id=str(saved.id),
            source=source,
        )
        await self._publish_insight_generated(saved)
        return saved

    async def _publish_insight_generated(self, insight: TaskInsight) -> None:
        deadline = insight.suggested_deadline
        raw = dict(insight.raw_ai or {})
        payload: dict[str, Any] = {
            "task_id": str(insight.task_id),
            "insight_id": str(insight.id),
            "suggested_priority": insight.suggested_priority,
            "suggested_deadline": deadline.isoformat() if deadline else None,
            "summary": insight.summary,
            "confidence": insight.confidence,
            "generated_at": insight.generated_at.isoformat(),
            "provider": raw.get("provider"),
            "model": raw.get("model"),
        }
        await self._event_bus.publish(
            Event(
                name="task.insight.generated",
                payload=payload,
                occurred_at=insight.generated_at.isoformat(),
                source="intelligence_service",
            )
        )
        log_event(
            self._logger,
            event="intelligence.publish.insight_generated",
            message="Published task.insight.generated",
            task_id=str(insight.task_id),
            insight_id=str(insight.id),
        )

    def _request_from_created_payload(
        self,
        payload: dict[str, Any],
    ) -> TaskInsightRequest:
        try:
            task_id = UUID(str(payload["task_id"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("task_id is required and must be a UUID") from exc
        title = payload.get("title")
        if not title:
            raise ValueError("title is required")
        return TaskInsightRequest(
            task_id=task_id,
            title=str(title),
            description=str(payload.get("description") or ""),
            current_priority=(
                str(payload["priority"]) if payload.get("priority") else None
            ),
            assignee_id=self._optional_uuid(payload.get("assignee_id")),
            metadata={
                "source": "event",
                "topic": "task.created",
                "status": payload.get("status"),
                "created_by": (
                    str(payload["created_by"]) if payload.get("created_by") else None
                ),
                "created_at": payload.get("created_at"),
            },
        )

    @staticmethod
    def _optional_uuid(value: Any) -> UUID | None:
        if value is None or value == "":
            return None
        return UUID(str(value))
