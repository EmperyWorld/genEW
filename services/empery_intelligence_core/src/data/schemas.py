"""API / event Pydantic models for Reflexes Intentions."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.empery_intelligence_core.src.core.reflexes.models import (
    Intention,
    IntentionKind,
    IntentionStatus,
)


class IntentionEnqueueRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    intent: str = Field(min_length=1, max_length=20000)
    kind: IntentionKind = IntentionKind.EVOLVE
    service_name: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_]*$")
    features: list[str] = Field(default_factory=list)
    ecc_job_id: UUID | None = None
    design_path: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class IntentionResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    intention: Intention


class IntentionListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    intentions: list[Intention]
    count: int


class WorkerHealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    worker_enabled: bool
    pending: int
    running: int
    paused: int
    last_tick_at: datetime | None
    active_intention_id: UUID | None


# --- Queue-port read models (Interface-compatible shapes) ---


class AutonomousJobStatus(str):
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AutonomousJobView(BaseModel):
    """Read model exposed via eic_queue_port (maps 1:1 from Intention)."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    intention_id: UUID
    status: str
    stage: str
    intention_text: str
    service_name: str | None = None
    provider_id: str = "fake"
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result_summary: str | None = None
    error_message: str | None = None
    artifact_paths: list[str] = Field(default_factory=list)
    ecc_job_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class IntentionRecordView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    text: str
    service_name: str | None = None
    features: list[str] = Field(default_factory=list)
    priority: int = 0
    created_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubmitIntentionRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    intention: str = Field(min_length=1, max_length=20000)
    service_name: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_]*$")
    features: list[str] = Field(default_factory=list)
    priority: int = Field(default=0, ge=0, le=100)
    metadata: dict[str, Any] = Field(default_factory=dict)
    kind: IntentionKind = IntentionKind.EVOLVE
    ecc_job_id: UUID | None = None
    design_path: str | None = None


class SubmitIntentionResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    intention: IntentionRecordView
    job: AutonomousJobView


class AutonomousModeResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    state: str
    enabled: bool
    active_job_id: UUID | None = None
    provider_id: str = "fake"
    updated_at: datetime


def intention_to_job_view(intention: Intention) -> AutonomousJobView:
    status_map = {
        IntentionStatus.PENDING: "queued",
        IntentionStatus.RUNNING: "running",
        IntentionStatus.PAUSED: "paused",
        IntentionStatus.COMPLETED: "completed",
        IntentionStatus.FAILED: "failed",
        IntentionStatus.CANCELLED: "cancelled",
    }
    stage = intention.checkpoint.stage.value
    if stage == "queued":
        stage = "intake"
    elif stage == "fix":
        stage = "implement"
    elif stage == "done":
        stage = "done"
    return AutonomousJobView(
        id=intention.id,
        intention_id=intention.id,
        status=status_map[intention.status],
        stage=stage,
        intention_text=intention.intent,
        service_name=intention.service_name,
        created_at=intention.created_at,
        updated_at=intention.updated_at,
        started_at=intention.started_at,
        finished_at=intention.finished_at,
        result_summary=intention.result_summary,
        error_message=intention.error_message,
        artifact_paths=list(intention.checkpoint.artifact_paths),
        ecc_job_id=intention.ecc_job_id,
        metadata=dict(intention.metadata),
    )
