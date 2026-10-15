"""Shared Autonomous Mode API contracts (EIC + ECC BFF)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProviderId(str, Enum):
    LOCAL = "local"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    FAKE = "fake"


class AutonomousModeState(str, Enum):
    OFF = "off"
    ON = "on"
    PAUSED = "paused"


class AutonomousJobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AutonomousStage(str, Enum):
    INTAKE = "intake"
    PLAN = "plan"
    IMPLEMENT = "implement"
    VERIFY = "verify"
    DONE = "done"


class IntentionRecord(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    text: str
    service_name: str | None = None
    features: list[str] = Field(default_factory=list)
    priority: int = 0
    created_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class AutonomousJob(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    intention_id: UUID
    status: AutonomousJobStatus
    stage: AutonomousStage
    intention_text: str
    service_name: str | None = None
    provider_id: ProviderId
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result_summary: str | None = None
    error_message: str | None = None
    artifact_paths: list[str] = Field(default_factory=list)
    ecc_job_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubmitIntentionRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    intention: str = Field(min_length=1, max_length=20000)
    service_name: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_]*$")
    features: list[str] = Field(default_factory=list)
    priority: int = Field(default=0, ge=0, le=100)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubmitIntentionResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    intention: IntentionRecord
    job: AutonomousJob


class AutonomousJobListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    jobs: list[AutonomousJob]
    total: int


class AutonomousJobResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    job: AutonomousJob


class AutonomousModeResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    state: AutonomousModeState
    enabled: bool
    active_job_id: UUID | None = None
    provider_id: ProviderId
    updated_at: datetime


class SetAutonomousModeRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    enabled: bool


class ProviderDescriptor(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: ProviderId
    label: str
    configured: bool
    healthy: bool | None = None
    is_local: bool


class ProviderConfigResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    active_provider_id: ProviderId
    available: list[ProviderDescriptor]
    llm_base_url: str
    runtime_override: bool
    updated_at: datetime


class SetProviderRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    provider_id: ProviderId
    llm_base_url: str | None = None


class SetProviderResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    config: ProviderConfigResponse
    switched: bool
    message: str


class MemorySearchHit(BaseModel):
    model_config = ConfigDict(frozen=True)

    atom_id: str
    kind: str
    title: str
    snippet: str
    score: float | None = None
    created_at: datetime | None = None
    service_name: str | None = None


class MemorySearchResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    query: str
    hits: list[MemorySearchHit]
    truncated: bool = False


class LlmHealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: Literal["ok", "degraded", "down"]
    provider_id: ProviderId
    base_url: str
    latency_ms: int | None = None
    model: str | None = None
    detail: str | None = None
    checked_at: datetime
