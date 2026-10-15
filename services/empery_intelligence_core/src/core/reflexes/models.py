"""Domain models for EIC Reflexes (Intention queue + loop checkpoints)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class IntentionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class LoopStage(str, Enum):
    QUEUED = "queued"
    PLAN = "plan"
    IMPLEMENT = "implement"
    VERIFY = "verify"
    FIX = "fix"
    DONE = "done"


class AgentRole(str, Enum):
    ARCHITECT = "architect"
    IMPLEMENTER = "implementer"
    VERIFIER = "verifier"
    REFACTORER = "refactorer"


class IntentionKind(str, Enum):
    PLAN = "plan"
    IMPLEMENT = "implement"
    VERIFY = "verify"
    EVOLVE = "evolve"


class LoopCheckpoint(BaseModel):
    """Persisted after every successful stage boundary (resume key)."""

    model_config = ConfigDict(frozen=True)

    stage: LoopStage
    role: AgentRole | None = None
    attempt: int = 0
    design_path: str | None = None
    report_path: str | None = None
    artifact_paths: list[str] = Field(default_factory=list)
    verify_status: Literal["PASSED", "FAILED", "UNKNOWN"] | None = None
    last_error: str | None = None
    role_summary: str | None = None
    updated_at: datetime


class RoleTurnRecord(BaseModel):
    model_config = ConfigDict(frozen=True)

    role: AgentRole
    stage: LoopStage
    started_at: datetime
    finished_at: datetime | None = None
    prompt_hash: str
    provider: str | None = None
    outcome: Literal["ok", "error", "cancelled"] | None = None
    summary: str | None = None


class Intention(BaseModel):
    """Source of truth for autonomous work — file under eic/intentions/."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    kind: IntentionKind
    status: IntentionStatus
    intent: str
    service_name: str | None = None
    features: list[str] = Field(default_factory=list)
    ecc_job_id: UUID | None = None
    checkpoint: LoopCheckpoint
    history: list[RoleTurnRecord] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    claimed_by: str | None = None
    result_summary: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RolePromptBundle(BaseModel):
    model_config = ConfigDict(frozen=True)

    role: AgentRole
    system_prompt: str
    skill_addendum: str
    rules_digest: str
    user_payload: str
    template_paths: list[str]
    prompt_hash: str
