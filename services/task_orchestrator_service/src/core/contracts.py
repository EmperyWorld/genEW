"""Interface contracts for the task_orchestrator_service provider pattern."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from core.integration.identity_verifier import (
    IdentityPrincipal,
    IdentityVerifier,
    IdentityVerifyResponse,
)
from services.task_orchestrator_service.src.core.models import (
    Task,
    TaskStatus,
    VerifiedIdentity,
)

# Re-export core identity contracts for local consumers.
__all__ = [
    "IdentityPrincipal",
    "IdentityVerifier",
    "IdentityVerifyResponse",
    "TaskRepositoryPort",
    "VerifiedIdentity",
]


class TaskRepositoryPort(Protocol):
    """Data-access contract resolved via ServiceContainer."""

    async def create_task(self, task: Task) -> Task: ...

    async def get_task(self, task_id: UUID) -> Task | None: ...

    async def list_tasks(
        self,
        *,
        limit: int,
        status: TaskStatus | None,
        assignee_id: UUID | None,
    ) -> list[Task]: ...

    async def update_task(self, task: Task) -> Task: ...
