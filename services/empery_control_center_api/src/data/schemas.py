"""Pydantic V2 API request/response and WebSocket message models."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.empery_control_center_api.src.core.models import (
    AuditLogEntry,
    JobMode,
    JobStatus,
    LifecycleSkill,
    OrchestrationJob,
    RegistrySnapshot,
)


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: Literal["ok", "degraded"]
    service: str
    version: str
    jobs_root_exists: bool
    audit_file_exists: bool
    subscribed_topics: list[str]
    ws_clients: int
    event_bus_backend: Literal["redis", "memory", "unknown"] = "unknown"
    event_bus_ok: bool = False
    redis_configured: bool = False
    auth_required: bool = False
    llm_ready: bool | None = Field(
        default=None,
        description=(
            "Best-effort Nervas readiness via EIC gateway "
            "(true=ok, false=down/degraded, null=probe unavailable)."
        ),
    )


class ServiceHealthItem(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    health: Literal["ok", "degraded", "down", "unknown"]
    checked_at: datetime | None = None


class HealthHistorySample(BaseModel):
    """Aggregate probe snapshot retained in memory (ring buffer)."""

    model_config = ConfigDict(frozen=True)

    checked_at: datetime
    ok_count: int = 0
    degraded_count: int = 0
    down_count: int = 0
    unknown_count: int = 0
    alert: bool = False


class HealthStatusChange(BaseModel):
    """Recent per-service health transition (non-ok or recovery)."""

    model_config = ConfigDict(frozen=True)

    service_name: str
    from_health: Literal["ok", "degraded", "down", "unknown"] | None = None
    to_health: Literal["ok", "degraded", "down", "unknown"]
    changed_at: datetime


class ServiceHealthListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    services: list[ServiceHealthItem]
    ok_count: int = 0
    degraded_count: int = 0
    down_count: int = 0
    unknown_count: int = 0
    alert: bool = Field(
        default=False,
        description="True when any probed service is degraded or down",
    )
    history: list[HealthHistorySample] = Field(
        default_factory=list,
        description="Recent aggregate probe snapshots (newest last)",
    )
    recent_changes: list[HealthStatusChange] = Field(
        default_factory=list,
        description="Recent per-service status transitions",
    )
    # Ops note: ship structured logs (event=ecc.health.services_alert) to your
    # log pipeline; Prometheus scrape is optional and not required for this signal.


class CreateCommandRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    skill: LifecycleSkill
    intent: str = Field(min_length=1, max_length=20000)
    service_name: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_]*$")
    features: list[str] = Field(default_factory=list)
    design_path: str | None = None
    mode: JobMode = JobMode.AGENT
    metadata: dict[str, Any] = Field(default_factory=dict)


class PlanCommandRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    intent: str = Field(min_length=1, max_length=20000)
    service_name: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    features: list[str] = Field(default_factory=list)
    mode: JobMode = JobMode.AGENT
    metadata: dict[str, Any] = Field(default_factory=dict)


class ImplementCommandRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    service_name: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    design_path: str | None = None
    intent: str = "Implement from approved design"
    mode: JobMode = JobMode.AGENT
    metadata: dict[str, Any] = Field(default_factory=dict)


class VerifyCommandRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    service_name: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    intent: str = "Verify service against Empery rules and tests"
    mode: JobMode = JobMode.AGENT
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvolveCommandRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    service_name: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    intent: str = Field(min_length=1, max_length=20000)
    features: list[str] = Field(default_factory=list)
    mode: JobMode = JobMode.AGENT
    metadata: dict[str, Any] = Field(default_factory=dict)


class ClaimJobRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    claimed_by: str = Field(min_length=1, max_length=200)


class UpdateJobRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: JobStatus | None = None
    result_summary: str | None = None
    error_message: str | None = None
    artifact_paths: list[str] | None = None
    design_path: str | None = None
    report_path: str | None = None
    metadata: dict[str, Any] | None = None
    mode: JobMode | None = None


class JobResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    job: OrchestrationJob
    pickup_hint: str


class JobListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    jobs: list[OrchestrationJob]
    count: int


class RegistrySnapshotResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    snapshot: RegistrySnapshot


class AuditListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    entries: list[AuditLogEntry]
    count: int
    source_exists: bool
    source_path: str


class OrchestrationPathsResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    orchestration_root: str
    jobs_root: str
    audit_path: str
    designs_root: str
    reports_root: str


class SandboxSessionResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    session_id: UUID
    status: Literal["ready", "probing", "closed"]
    created_at: datetime


class SandboxProbeRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    publisher: str | None = Field(default=None, max_length=200)
    subscriber: str | None = Field(default=None, max_length=200)
    topic: str = Field(min_length=1, max_length=200)
    payload: dict[str, Any] = Field(default_factory=dict)
    confirm_destructive: bool = False


class SandboxProbeResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    session_id: UUID
    probe_id: UUID
    accepted: bool
    status: Literal["accepted", "ok", "failed", "pending"] = "accepted"
    message: str | None = None
    observed_at: datetime | None = None
    echo: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] = Field(default_factory=dict)


class EccRegisterRequest(BaseModel):
    """Registration payload for ECC BFF (proxied to identity_service)."""

    model_config = ConfigDict(frozen=True)

    email: str = Field(min_length=3)
    password: str = Field(min_length=8)
    display_name: str | None = Field(default=None, max_length=200)


class EccRegisterResponse(BaseModel):
    """Successful ECC BFF registration payload."""

    model_config = ConfigDict(frozen=True)

    user: EccUserSummary


class EccLoginRequest(BaseModel):
    """Credentials for ECC BFF login (proxied to identity_service)."""

    model_config = ConfigDict(frozen=True)

    email: str = Field(min_length=3)
    password: str = Field(min_length=8)


class EccUserSummary(BaseModel):
    """Authenticated user summary returned by login/me."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    email: str
    display_name: str
    is_active: bool = True
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)


class EccLoginResponse(BaseModel):
    """Successful ECC BFF login payload."""

    model_config = ConfigDict(frozen=True)

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: EccUserSummary


class EccLogoutResponse(BaseModel):
    """Logout acknowledgement (stateless JWT — client clears token)."""

    model_config = ConfigDict(frozen=True)

    ok: bool = True


class EccPasswordResetRequest(BaseModel):
    """Request admin-mediated password reset for an email address."""

    model_config = ConfigDict(frozen=True)

    email: str = Field(min_length=3)


class EccPasswordResetRequestResponse(BaseModel):
    """Password reset request acknowledgement (token may be admin-revealed)."""

    model_config = ConfigDict(frozen=True)

    ok: bool = True
    message: str | None = None
    reset_token: str | None = None


class EccPasswordResetConfirmRequest(BaseModel):
    """Confirm password reset using a reset token."""

    model_config = ConfigDict(frozen=True)

    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class EccPasswordResetConfirmResponse(BaseModel):
    """Password reset confirmation acknowledgement."""

    model_config = ConfigDict(frozen=True)

    ok: bool = True


class EccRoleItem(BaseModel):
    """Role summary proxied from identity_service."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    permissions: list[str] = Field(default_factory=list)
    created_at: datetime


class EccRoleListResponse(BaseModel):
    """List of roles and permissions."""

    model_config = ConfigDict(frozen=True)

    roles: list[EccRoleItem]


class EccAssignRoleRequest(BaseModel):
    """Assign a user's primary role."""

    model_config = ConfigDict(frozen=True)

    role: str = Field(pattern="^(admin|member|viewer)$")


class EccAssignRoleResponse(BaseModel):
    """Role assignment result."""

    model_config = ConfigDict(frozen=True)

    user: EccUserSummary


class WsClientMessage(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: Literal["subscribe", "unsubscribe", "ping"]
    topics: list[str] = Field(default_factory=list)


class WsServerMessage(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: Literal["event", "registry", "heartbeat", "error", "hello"]
    ts: datetime
    event_name: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    # Wave 2 — optional Event envelope passthrough (additive).
    occurred_at: str | None = None
    source: str | None = None
    schema_version: str | None = None


# Re-export UUID for route typing convenience
__all__ = [
    "AuditListResponse",
    "ClaimJobRequest",
    "CreateCommandRequest",
    "EccAssignRoleRequest",
    "EccAssignRoleResponse",
    "EccLoginRequest",
    "EccLoginResponse",
    "EccLogoutResponse",
    "EccPasswordResetConfirmRequest",
    "EccPasswordResetConfirmResponse",
    "EccPasswordResetRequest",
    "EccPasswordResetRequestResponse",
    "EccRegisterRequest",
    "EccRegisterResponse",
    "EccRoleItem",
    "EccRoleListResponse",
    "EccUserSummary",
    "EvolveCommandRequest",
    "HealthResponse",
    "ImplementCommandRequest",
    "JobListResponse",
    "JobResponse",
    "OrchestrationPathsResponse",
    "PlanCommandRequest",
    "RegistrySnapshotResponse",
    "SandboxProbeRequest",
    "SandboxProbeResponse",
    "SandboxSessionResponse",
    "ServiceHealthItem",
    "ServiceHealthListResponse",
    "UpdateJobRequest",
    "VerifyCommandRequest",
    "WsClientMessage",
    "WsServerMessage",
    "UUID",
]
