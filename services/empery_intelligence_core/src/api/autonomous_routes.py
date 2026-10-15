"""FastAPI router for Autonomous Mode under /api/v1/autonomous."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from services.empery_intelligence_core.src.core.autonomous_use_cases import (
    EicAutonomousUseCases,
)
from services.empery_intelligence_core.src.data.schemas_autonomous import (
    AutonomousJobListResponse,
    AutonomousJobResponse,
    AutonomousJobStatus,
    AutonomousModeResponse,
    LlmHealthResponse,
    MemorySearchResponse,
    ProviderConfigResponse,
    SetAutonomousModeRequest,
    SetProviderRequest,
    SetProviderResponse,
    SubmitIntentionRequest,
    SubmitIntentionResponse,
)

router = APIRouter(prefix="/autonomous", tags=["autonomous"])


def _uc(request: Request) -> EicAutonomousUseCases:
    return request.app.state.container.resolve("eic_autonomous_use_cases")


@router.post(
    "/intentions",
    response_model=SubmitIntentionResponse,
    status_code=201,
)
async def submit_intention(
    payload: SubmitIntentionRequest, request: Request
) -> SubmitIntentionResponse:
    return await _uc(request).submit_intention(payload)


@router.get("/jobs", response_model=AutonomousJobListResponse)
async def list_jobs(
    request: Request,
    status: AutonomousJobStatus | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> AutonomousJobListResponse:
    return await _uc(request).list_jobs(status=status, limit=limit)


@router.get("/jobs/{job_id}", response_model=AutonomousJobResponse)
async def get_job(job_id: UUID, request: Request) -> AutonomousJobResponse:
    return await _uc(request).get_job(job_id)


@router.post("/jobs/{job_id}/pause", response_model=AutonomousJobResponse)
async def pause_job(job_id: UUID, request: Request) -> AutonomousJobResponse:
    return await _uc(request).pause_job(job_id)


@router.post("/jobs/{job_id}/resume", response_model=AutonomousJobResponse)
async def resume_job(job_id: UUID, request: Request) -> AutonomousJobResponse:
    return await _uc(request).resume_job(job_id)


@router.post("/jobs/{job_id}/cancel", response_model=AutonomousJobResponse)
async def cancel_job(job_id: UUID, request: Request) -> AutonomousJobResponse:
    return await _uc(request).cancel_job(job_id)


@router.get("/mode", response_model=AutonomousModeResponse)
async def get_mode(request: Request) -> AutonomousModeResponse:
    return await _uc(request).get_mode()


@router.put("/mode", response_model=AutonomousModeResponse)
async def set_mode(
    payload: SetAutonomousModeRequest, request: Request
) -> AutonomousModeResponse:
    return await _uc(request).set_mode(payload.enabled)


@router.get("/providers", response_model=ProviderConfigResponse)
async def get_providers(request: Request) -> ProviderConfigResponse:
    return await _uc(request).get_providers()


@router.put("/providers", response_model=SetProviderResponse)
async def set_provider(
    payload: SetProviderRequest, request: Request
) -> SetProviderResponse:
    return await _uc(request).set_provider(
        payload.provider_id, llm_base_url=payload.llm_base_url
    )


@router.get("/memory/search", response_model=MemorySearchResponse)
async def search_memory(
    request: Request,
    q: str = Query(min_length=1, max_length=500),
    limit: int = Query(default=10, ge=1, le=50),
    service_name: str | None = Query(default=None, max_length=120),
) -> MemorySearchResponse:
    return await _uc(request).search_memory(
        q, limit=limit, service_name=service_name
    )


@router.get("/llm/health", response_model=LlmHealthResponse)
async def llm_health(request: Request) -> LlmHealthResponse:
    return await _uc(request).llm_health()
