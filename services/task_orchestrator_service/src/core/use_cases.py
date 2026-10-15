"""Task orchestrator use cases."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event
from core.integration.identity_verifier import IdentityPrincipal
from core.logging import log_event
from services.task_orchestrator_service.src.core.contracts import TaskRepositoryPort
from services.task_orchestrator_service.src.core.models import (
    Task,
    TaskStatus,
    VerifiedIdentity,
)
from services.task_orchestrator_service.src.data.schemas import (
    AssignTaskRequest,
    CreateTaskRequest,
    TaskListResponse,
    TaskResponse,
    UpdateTaskRequest,
)
from services.task_orchestrator_service.src.integration.identity_adapter import (
    strip_bearer_token,
)


class TaskUseCases:
    """Application services for Kanban task workflows."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._repo: TaskRepositoryPort = container.resolve("task_repository")
        self._logger = container.resolve("logger")
        self._event_bus = container.resolve("event_bus")

    def _require_actor(self, authorization: str | None) -> VerifiedIdentity:
        """Verify Bearer via container ``identity_verifier`` before any mutation."""
        token = strip_bearer_token(authorization)
        try:
            verifier = self._container.resolve("identity_verifier")
        except KeyError as exc:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_UNAVAILABLE",
                    message="Identity verifier is not available",
                    details={"reason": "identity_verifier not registered"},
                ),
                http_status=503,
            ) from exc
        try:
            principal: IdentityPrincipal = verifier.verify_token(token)
        except ServiceError:
            raise
        except Exception as exc:  # noqa: BLE001 — map reject to unauthorized
            log_event(
                self._logger,
                event="task.identity.rejected",
                message="Identity verifier rejected token",
                level=logging.WARNING,
                reason=str(exc),
            )
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="TASK_UNAUTHORIZED",
                    message="Identity verification failed",
                    details={"reason": str(exc)},
                ),
                http_status=401,
            ) from exc
        return VerifiedIdentity(user_id=principal.user_id, email=principal.email)

    async def create_task(
        self,
        request: CreateTaskRequest,
        *,
        authorization: str | None,
    ) -> TaskResponse:
        actor = self._require_actor(authorization)
        now = datetime.now(timezone.utc)
        task = Task(
            id=uuid4(),
            title=request.title,
            description=request.description,
            status=request.status,
            priority=request.priority,
            assignee_id=request.assignee_id,
            created_by=actor.user_id,
            updated_by=actor.user_id,
            created_at=now,
            updated_at=now,
        )
        saved = await self._repo.create_task(task)
        await self._event_bus.publish(
            Event(
                name="task.created",
                payload={
                    "task_id": str(saved.id),
                    "title": saved.title,
                    "description": saved.description,
                    "assignee_id": (
                        str(saved.assignee_id) if saved.assignee_id else None
                    ),
                    "status": saved.status.value,
                    "priority": saved.priority.value,
                    "created_by": str(saved.created_by),
                    "created_at": saved.created_at.isoformat(),
                },
                occurred_at=saved.created_at.isoformat(),
                source="task_orchestrator_service",
            )
        )
        log_event(
            self._logger,
            event="task.create.success",
            message="Task created",
            task_id=str(saved.id),
            created_by=str(saved.created_by),
        )
        return TaskResponse(task=saved)

    async def list_tasks(
        self,
        *,
        limit: int,
        status: TaskStatus | None,
        assignee_id: UUID | None,
    ) -> TaskListResponse:
        tasks = await self._repo.list_tasks(
            limit=limit,
            status=status,
            assignee_id=assignee_id,
        )
        return TaskListResponse(tasks=tasks, count=len(tasks))

    async def get_task(self, task_id: UUID) -> TaskResponse:
        task = await self._repo.get_task(task_id)
        if task is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="TASK_NOT_FOUND",
                    message=f"Task '{task_id}' not found",
                ),
                http_status=404,
            )
        return TaskResponse(task=task)

    async def update_task(
        self,
        task_id: UUID,
        request: UpdateTaskRequest,
        *,
        authorization: str | None,
    ) -> TaskResponse:
        actor = self._require_actor(authorization)
        existing = await self._repo.get_task(task_id)
        if existing is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="TASK_NOT_FOUND",
                    message=f"Task '{task_id}' not found",
                ),
                http_status=404,
            )

        changed_fields: list[str] = []
        title = existing.title
        description = existing.description
        status = existing.status
        priority = existing.priority

        if request.title is not None and request.title != existing.title:
            title = request.title
            changed_fields.append("title")
        if (
            request.description is not None
            and request.description != existing.description
        ):
            description = request.description
            changed_fields.append("description")
        if request.status is not None and request.status != existing.status:
            status = request.status
            changed_fields.append("status")
        if request.priority is not None and request.priority != existing.priority:
            priority = request.priority
            changed_fields.append("priority")

        now = datetime.now(timezone.utc)
        updated = Task(
            id=existing.id,
            title=title,
            description=description,
            status=status,
            priority=priority,
            assignee_id=existing.assignee_id,
            created_by=existing.created_by,
            updated_by=actor.user_id,
            created_at=existing.created_at,
            updated_at=now,
        )
        saved = await self._repo.update_task(updated)
        update_payload: dict[str, Any] = {
            "task_id": str(saved.id),
            "changed_fields": changed_fields,
            "status": saved.status.value,
            "updated_by": str(actor.user_id),
            "updated_at": saved.updated_at.isoformat(),
        }
        # Enrich when content fields change so intelligence can re-analyze
        # without a cross-service DB read.
        if "title" in changed_fields or "description" in changed_fields:
            update_payload["title"] = saved.title
            update_payload["description"] = saved.description
            update_payload["priority"] = saved.priority.value
            if saved.assignee_id is not None:
                update_payload["assignee_id"] = str(saved.assignee_id)
        await self._event_bus.publish(
            Event(
                name="task.updated",
                payload=update_payload,
                occurred_at=saved.updated_at.isoformat(),
                source="task_orchestrator_service",
            )
        )
        log_event(
            self._logger,
            event="task.update.success",
            message="Task updated",
            task_id=str(saved.id),
            changed_fields=changed_fields,
        )
        return TaskResponse(task=saved)

    async def assign_task(
        self,
        task_id: UUID,
        request: AssignTaskRequest,
        *,
        authorization: str | None,
    ) -> TaskResponse:
        actor = self._require_actor(authorization)
        existing = await self._repo.get_task(task_id)
        if existing is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="TASK_NOT_FOUND",
                    message=f"Task '{task_id}' not found",
                ),
                http_status=404,
            )
        now = datetime.now(timezone.utc)
        updated = Task(
            id=existing.id,
            title=existing.title,
            description=existing.description,
            status=existing.status,
            priority=existing.priority,
            assignee_id=request.assignee_id,
            created_by=existing.created_by,
            updated_by=actor.user_id,
            created_at=existing.created_at,
            updated_at=now,
        )
        saved = await self._repo.update_task(updated)
        await self._event_bus.publish(
            Event(
                name="task.assigned",
                payload={
                    "task_id": str(saved.id),
                    "assignee_id": str(saved.assignee_id),
                    "assigned_by": str(actor.user_id),
                    "assigned_at": saved.updated_at.isoformat(),
                },
                occurred_at=saved.updated_at.isoformat(),
                source="task_orchestrator_service",
            )
        )
        log_event(
            self._logger,
            event="task.assign.success",
            message="Task assigned",
            task_id=str(saved.id),
            assignee_id=str(saved.assignee_id),
        )
        return TaskResponse(task=saved)
