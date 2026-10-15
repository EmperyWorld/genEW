"""REST router for empery_control_center_api under /api/v1."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.models import JobStatus, LifecycleSkill
from services.empery_control_center_api.src.core.use_cases import EccUseCases
from services.empery_control_center_api.src.data.schemas import (
    AuditListResponse,
    ClaimJobRequest,
    CreateCommandRequest,
    EvolveCommandRequest,
    HealthResponse,
    ImplementCommandRequest,
    JobListResponse,
    JobResponse,
    OrchestrationPathsResponse,
    PlanCommandRequest,
    RegistrySnapshotResponse,
    SandboxProbeRequest,
    SandboxProbeResponse,
    SandboxSessionResponse,
    ServiceHealthListResponse,
    UpdateJobRequest,
    VerifyCommandRequest,
)

router = APIRouter()


def _load_manifest() -> dict:
    manifest_path = Path(__file__).resolve().parents[2] / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def _uc(request: Request) -> EccUseCases:
    return request.app.state.container.resolve("ecc_use_cases")


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    manifest = _load_manifest()
    return await _uc(request).health(
        version=manifest["version"],
        service=manifest["name"],
    )


@router.get("/health/services", response_model=ServiceHealthListResponse)
async def health_services(request: Request) -> ServiceHealthListResponse:
    """Registry-driven batch health for Control Center ecosystem map."""
    manifest = _load_manifest()
    return await _uc(request).services_health(
        version=manifest["version"],
        service=manifest["name"],
    )


@router.post("/commands", response_model=JobResponse, status_code=201)
async def create_command(
    payload: CreateCommandRequest, request: Request
) -> JobResponse:
    return await _uc(request).create_command(payload)


@router.post("/commands/plan", response_model=JobResponse, status_code=201)
async def command_plan(payload: PlanCommandRequest, request: Request) -> JobResponse:
    return await _uc(request).plan(payload)


@router.post("/commands/implement", response_model=JobResponse, status_code=201)
async def command_implement(
    payload: ImplementCommandRequest, request: Request
) -> JobResponse:
    return await _uc(request).implement(payload)


@router.post("/commands/verify", response_model=JobResponse, status_code=201)
async def command_verify(
    payload: VerifyCommandRequest, request: Request
) -> JobResponse:
    return await _uc(request).verify(payload)


@router.post("/commands/evolve", response_model=JobResponse, status_code=201)
async def command_evolve(
    payload: EvolveCommandRequest, request: Request
) -> JobResponse:
    return await _uc(request).evolve(payload)


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    request: Request,
    status: JobStatus | None = Query(default=None),
    skill: LifecycleSkill | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> JobListResponse:
    return await _uc(request).list_jobs(status=status, skill=skill, limit=limit)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: UUID, request: Request) -> JobResponse:
    return await _uc(request).get_job(job_id)


@router.post("/jobs/{job_id}/claim", response_model=JobResponse)
async def claim_job(
    job_id: UUID, payload: ClaimJobRequest, request: Request
) -> JobResponse:
    return await _uc(request).claim_job(job_id, payload)


@router.patch("/jobs/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: UUID, payload: UpdateJobRequest, request: Request
) -> JobResponse:
    return await _uc(request).update_job(job_id, payload)


@router.post("/jobs/{job_id}/cancel", response_model=JobResponse)
async def cancel_job(job_id: UUID, request: Request) -> JobResponse:
    return await _uc(request).cancel_job(job_id)


@router.get("/registry", response_model=RegistrySnapshotResponse)
async def get_registry(request: Request) -> RegistrySnapshotResponse:
    return await _uc(request).registry_snapshot()


@router.post("/registry/refresh", response_model=RegistrySnapshotResponse)
async def refresh_registry(request: Request) -> RegistrySnapshotResponse:
    return await _uc(request).registry_refresh()


@router.get("/audit", response_model=AuditListResponse)
async def get_audit(
    request: Request,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    category: str | None = Query(
        default=None,
        description="Comma-separated categories to include (intelligence,system,audit_hook).",
    ),
    exclude_category: str | None = Query(
        default=None,
        description="Comma-separated categories to exclude (e.g. audit_hook).",
    ),
    include_hooks: bool | None = Query(
        default=None,
        description=(
            "When false, omit Cursor audit_hook rows (afterFileEdit, …). "
            "When true, keep them. Overrides exclude_category for audit_hook."
        ),
    ),
) -> AuditListResponse:
    return await _uc(request).read_audit(
        limit=limit,
        offset=offset,
        category=category,
        exclude_category=exclude_category,
        include_hooks=include_hooks,
    )


@router.get("/orchestration/paths", response_model=OrchestrationPathsResponse)
async def orchestration_paths(request: Request) -> OrchestrationPathsResponse:
    return _uc(request).orchestration_paths()


@router.post(
    "/sandbox/sessions",
    response_model=SandboxSessionResponse,
    status_code=201,
)
async def create_sandbox_session(request: Request) -> SandboxSessionResponse:
    """Create an interactive sandbox session for EventBus probes."""
    return await _uc(request).create_sandbox_session()


@router.post(
    "/sandbox/sessions/{session_id}/probe",
    response_model=SandboxProbeResponse,
)
async def sandbox_probe(
    session_id: UUID,
    payload: SandboxProbeRequest,
    request: Request,
) -> SandboxProbeResponse:
    """Publish a sandbox interaction probe onto the EventBus."""
    return await _uc(request).sandbox_probe(session_id, payload)
