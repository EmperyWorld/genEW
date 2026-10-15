"""Ports (protocols) for empery_control_center_api DI."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from services.empery_control_center_api.src.core.models import (
    AuditLogEntry,
    JobStatus,
    LifecycleSkill,
    OrchestrationJob,
    RegistrySnapshot,
)
from services.empery_control_center_api.src.data.schemas import (
    UpdateJobRequest,
    WsServerMessage,
)


class JobStorePort(Protocol):
    async def create(self, job: OrchestrationJob) -> OrchestrationJob: ...

    async def get(self, job_id: UUID) -> OrchestrationJob | None: ...

    async def list(
        self,
        *,
        status: JobStatus | None,
        skill: LifecycleSkill | None,
        limit: int,
    ) -> list[OrchestrationJob]: ...

    async def claim(self, job_id: UUID, claimed_by: str) -> OrchestrationJob: ...

    async def update(
        self, job_id: UUID, patch: UpdateJobRequest
    ) -> OrchestrationJob: ...

    async def cancel(self, job_id: UUID) -> OrchestrationJob: ...

    def ensure_layout(self) -> None: ...


class AuditReaderPort(Protocol):
    async def read(
        self,
        *,
        limit: int,
        offset: int,
        categories: set[str] | None = None,
        exclude_categories: set[str] | None = None,
    ) -> tuple[list[AuditLogEntry], bool, str]: ...


class RegistrySnapshotPort(Protocol):
    def snapshot(self) -> RegistrySnapshot: ...


class WsHubPort(Protocol):
    async def connect(self, websocket: Any) -> None: ...

    async def disconnect(self, websocket: Any) -> None: ...

    async def broadcast(self, message: WsServerMessage) -> None: ...

    def client_count(self) -> int: ...


class SandboxSessionStorePort(Protocol):
    def create(self) -> Any: ...

    def get(self, session_id: UUID) -> Any: ...

    def mark_probing(self, session_id: UUID) -> Any: ...

    def mark_ready(self, session_id: UUID) -> None: ...
