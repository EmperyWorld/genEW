"""Port protocols for EIC Reflexes."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from services.empery_intelligence_core.src.core.reflexes.models import (
    AgentRole,
    Intention,
    IntentionKind,
    IntentionStatus,
    LoopCheckpoint,
    RolePromptBundle,
)


class IntentionStorePort(Protocol):
    def ensure_layout(self) -> None: ...

    async def create(self, intention: Intention) -> Intention: ...

    async def get(self, intention_id: UUID) -> Intention | None: ...

    async def list(
        self,
        *,
        status: IntentionStatus | None,
        kind: IntentionKind | None,
        limit: int,
    ) -> list[Intention]: ...

    async def claim_next(self, claimed_by: str) -> Intention | None: ...

    async def update_checkpoint(
        self, intention_id: UUID, checkpoint: LoopCheckpoint
    ) -> Intention: ...

    async def pause(self, intention_id: UUID, *, reason: str | None = None) -> Intention: ...

    async def resume(self, intention_id: UUID) -> Intention: ...

    async def cancel(self, intention_id: UUID) -> Intention: ...

    async def complete(
        self, intention_id: UUID, *, result_summary: str | None = None
    ) -> Intention: ...

    async def fail(self, intention_id: UUID, *, error_message: str) -> Intention: ...

    async def recover_running(self) -> list[Intention]: ...

    async def depths(self) -> dict[str, int]: ...


class PromptTemplatePort(Protocol):
    def build(
        self,
        role: AgentRole,
        intention: Intention,
        *,
        include_evolve_addendum: bool = False,
    ) -> RolePromptBundle: ...


class WorkspaceToolPort(Protocol):
    def apply_actions(
        self,
        actions: list[dict[str, Any]],
        *,
        role: AgentRole,
        service_name: str | None,
    ) -> list[str]: ...

    def write_design(
        self, service_name: str, markdown: str, json_body: str | None = None
    ) -> list[str]: ...

    def write_verify_report(
        self, service_name: str, body: str, *, status: str
    ) -> str: ...

    def run_pytest(self, path: str | None = None) -> tuple[int, str]: ...


class NervasPort(Protocol):
    async def reason(self, request: Any) -> Any: ...

    async def chat(self, request: Any) -> Any: ...

    async def plan(self, request: Any) -> Any: ...

    async def health(self) -> Any: ...


class MemoryHookPort(Protocol):
    async def record_plan_decision(self, intention: Intention, summary: str) -> None: ...

    async def record_verify_report(
        self, intention: Intention, *, status: str, summary: str
    ) -> None: ...


class EccBridgePort(Protocol):
    async def on_intention_event(
        self, event_name: str, payload: dict[str, Any]
    ) -> None: ...


class HeadlessLoopPort(Protocol):
    async def run(self, intention: Intention) -> Intention: ...


class EicQueuePort(Protocol):
    """Facade consumed by Autonomous Mode / ECC (Interface design)."""

    async def enqueue_intention(self, req: Any) -> Any: ...

    async def list_jobs(self, *, status: Any | None, limit: int) -> list[Any]: ...

    async def get_job(self, job_id: UUID) -> Any | None: ...

    async def pause(self, job_id: UUID) -> Any: ...

    async def resume(self, job_id: UUID) -> Any: ...

    async def cancel(self, job_id: UUID) -> Any: ...

    async def get_mode(self) -> Any: ...

    async def set_mode(self, enabled: bool) -> Any: ...
