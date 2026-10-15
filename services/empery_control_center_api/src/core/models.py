"""Immutable domain entities for empery_control_center_api."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LifecycleSkill(str, Enum):
    PLAN = "plan"
    IMPLEMENT = "implement"
    VERIFY = "verify"
    EVOLVE = "evolve"


class JobStatus(str, Enum):
    PENDING = "pending"
    CLAIMED = "claimed"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobMode(str, Enum):
    """Enqueue accepts ``agent`` only. ``demo`` may appear on legacy job JSON."""

    AGENT = "agent"
    DEMO = "demo"  # legacy persisted jobs only — rejected on create/enqueue



class OrchestrationJob(BaseModel):
    """Immutable job record persisted as JSON under jobs/."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    skill: LifecycleSkill
    status: JobStatus
    mode: JobMode = JobMode.AGENT
    service_name: str | None = None
    intent: str
    features: list[str] = Field(default_factory=list)
    design_path: str | None = None
    report_path: str | None = None
    agent_hint: str | None = None
    created_at: datetime
    updated_at: datetime
    claimed_at: datetime | None = None
    claimed_by: str | None = None
    result_summary: str | None = None
    error_message: str | None = None
    artifact_paths: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RegistryServiceEntry(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    version: str
    features: list[str]
    entry_point: str
    dependencies: list[str]
    publishes: list[str] = Field(default_factory=list)
    subscribes: list[str] = Field(default_factory=list)


class RegistrySnapshot(BaseModel):
    model_config = ConfigDict(frozen=True)

    generated_at: datetime
    services: list[RegistryServiceEntry]


# Cursor IDE hooks → orchestration/audit/events.jsonl (not ecosystem EventBus).
AUDIT_HOOK_EVENTS: frozenset[str] = frozenset(
    {
        "afterFileEdit",
        "beforeShellExecution",
        "afterAgentResponse",
        "beforeSubmitPrompt",
        "afterAgentThought",
        "stop",
        "sessionStart",
        "sessionEnd",
    }
)


def classify_audit_category(event: str | None) -> str:
    """Tag audit rows so Insight Feed can hide IDE hook noise by default."""
    if not event:
        return "system"
    lowered = event.strip().lower()
    hook_names = {name.lower() for name in AUDIT_HOOK_EVENTS}
    if event in AUDIT_HOOK_EVENTS or lowered in hook_names:
        return "audit_hook"
    # CamelCase / UPPERCASE Cursor-style hook names without dotted namespaces
    if "." not in event and (
        lowered.startswith("after") or lowered.startswith("before")
    ):
        return "audit_hook"
    if event.startswith(("ecc.", "orchestration.")):
        return "system"
    return "intelligence"


class AuditLogEntry(BaseModel):
    """Normalized view of one audit JSONL line."""

    model_config = ConfigDict(frozen=True)

    raw: dict[str, Any]
    timestamp: str | None = None
    event: str | None = None
    summary: str | None = None
    category: str = "system"
