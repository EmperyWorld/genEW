"""Headless execution engine contracts and IntentionSource boundary."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from core.errors import StandardizedErrorResponse


class IntentionHandle(BaseModel):
    """Opaque intention reference — persistence owned by Architect 3."""

    model_config = ConfigDict(frozen=True)

    intention_id: str
    summary: str
    payload: dict[str, Any] = Field(default_factory=dict)


class IntentionSource(Protocol):
    """Queue boundary — engine consumes; Architect 3 implements persistence."""

    async def claim_next(self) -> IntentionHandle | None: ...

    async def get(self, intention_id: str) -> IntentionHandle: ...

    async def mark_complete(
        self, intention_id: str, result: dict[str, Any]
    ) -> None: ...

    async def mark_failed(
        self, intention_id: str, error: StandardizedErrorResponse
    ) -> None: ...


class RoleName(str, Enum):
    ARCHITECT = "architect"
    IMPLEMENTER = "implementer"
    VERIFIER = "verifier"
    REFACTORER = "refactorer"


class PromptTemplate(BaseModel):
    model_config = ConfigDict(frozen=True)

    role: RoleName | str
    source_path: str
    body: str


class RolePromptLoader(Protocol):
    def load_agent(self, role: RoleName) -> PromptTemplate: ...

    def load_skill(self, skill_name: str) -> PromptTemplate: ...


class EngineCycleStartRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    intention_id: str
    roles: list[RoleName] = Field(
        default_factory=lambda: [
            RoleName.ARCHITECT,
            RoleName.IMPLEMENTER,
            RoleName.VERIFIER,
        ]
    )
    allow_service_writes: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class EngineCycleAccepted(BaseModel):
    model_config = ConfigDict(frozen=True)

    cycle_id: str
    intention_id: str
    state: Literal["queued", "running", "passed", "failed", "cancelled"] = "running"


class EngineCyclePhaseResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    role: RoleName
    status: Literal["ok", "failed", "skipped"]
    output_summary: str
    artifact_paths: list[str] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)


class EngineCycleStatus(BaseModel):
    model_config = ConfigDict(frozen=True)

    cycle_id: str
    intention_id: str
    state: Literal["queued", "running", "passed", "failed", "cancelled"]
    phases: list[EngineCyclePhaseResult] = Field(default_factory=list)
    verify_status: Literal["PASSED", "FAILED", "PENDING"] | None = None
    error: StandardizedErrorResponse | None = None


class InMemoryIntentionSource:
    """Test / scaffold IntentionSource — Architect 3 replaces with file store."""

    def __init__(self) -> None:
        self._items: dict[str, IntentionHandle] = {}
        self._order: list[str] = []
        self._results: dict[str, dict[str, Any]] = {}
        self._failures: dict[str, StandardizedErrorResponse] = {}

    def seed(self, handle: IntentionHandle) -> None:
        self._items[handle.intention_id] = handle
        if handle.intention_id not in self._order:
            self._order.append(handle.intention_id)

    async def claim_next(self) -> IntentionHandle | None:
        if not self._order:
            return None
        intention_id = self._order.pop(0)
        return self._items[intention_id]

    async def get(self, intention_id: str) -> IntentionHandle:
        if intention_id not in self._items:
            from core.errors import ServiceError

            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ENGINE_INTENTION_NOT_FOUND",
                    message=f"Intention '{intention_id}' not found",
                    details={"intention_id": intention_id},
                ),
                http_status=404,
            )
        return self._items[intention_id]

    async def mark_complete(
        self, intention_id: str, result: dict[str, Any]
    ) -> None:
        self._results[intention_id] = result

    async def mark_failed(
        self, intention_id: str, error: StandardizedErrorResponse
    ) -> None:
        self._failures[intention_id] = error
