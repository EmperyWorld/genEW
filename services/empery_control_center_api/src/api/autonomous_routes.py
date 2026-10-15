"""ECC Autonomous gateway — thin routes resolving eic_autonomous_use_cases."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_control_center_api.src.integration.eic_gateway_adapter import (
    resolve_eic_gateway,
)
from core.integration.autonomous import (
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


def _gateway(request: Request):
    config = getattr(request.app.state, "config", None)
    if config is not None and not getattr(config, "autonomous_gateway_enabled", True):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_EIC_UNAVAILABLE",
                message="Autonomous gateway is disabled (ECC_AUTONOMOUS_GATEWAY=false)",
            ),
            http_status=503,
        )
    return resolve_eic_gateway(request.app.state.container)


@router.post(
    "/intentions",
    response_model=SubmitIntentionResponse,
    status_code=201,
)
async def submit_intention(
    payload: SubmitIntentionRequest, request: Request
) -> SubmitIntentionResponse:
    return await _gateway(request).submit_intention(payload)


@router.get("/jobs", response_model=AutonomousJobListResponse)
async def list_jobs(
    request: Request,
    status: AutonomousJobStatus | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> AutonomousJobListResponse:
    return await _gateway(request).list_jobs(status=status, limit=limit)


@router.get("/jobs/{job_id}", response_model=AutonomousJobResponse)
async def get_job(job_id: UUID, request: Request) -> AutonomousJobResponse:
    return await _gateway(request).get_job(job_id)


@router.post("/jobs/{job_id}/pause", response_model=AutonomousJobResponse)
async def pause_job(job_id: UUID, request: Request) -> AutonomousJobResponse:
    return await _gateway(request).pause_job(job_id)


@router.post("/jobs/{job_id}/resume", response_model=AutonomousJobResponse)
async def resume_job(job_id: UUID, request: Request) -> AutonomousJobResponse:
    return await _gateway(request).resume_job(job_id)


@router.post("/jobs/{job_id}/cancel", response_model=AutonomousJobResponse)
async def cancel_job(job_id: UUID, request: Request) -> AutonomousJobResponse:
    return await _gateway(request).cancel_job(job_id)


@router.get("/mode", response_model=AutonomousModeResponse)
async def get_mode(request: Request) -> AutonomousModeResponse:
    return await _gateway(request).get_mode()


@router.put("/mode", response_model=AutonomousModeResponse)
async def set_mode(
    payload: SetAutonomousModeRequest, request: Request
) -> AutonomousModeResponse:
    return await _gateway(request).set_mode(payload.enabled)


@router.get("/providers", response_model=ProviderConfigResponse)
async def get_providers(request: Request) -> ProviderConfigResponse:
    return await _gateway(request).get_providers()


@router.put("/providers", response_model=SetProviderResponse)
async def set_provider(
    payload: SetProviderRequest, request: Request
) -> SetProviderResponse:
    return await _gateway(request).set_provider(
        payload.provider_id, llm_base_url=payload.llm_base_url
    )


@router.get("/memory/search", response_model=MemorySearchResponse)
async def search_memory(
    request: Request,
    q: str = Query(min_length=1, max_length=500),
    limit: int = Query(default=10, ge=1, le=50),
    service_name: str | None = Query(default=None, max_length=120),
) -> MemorySearchResponse:
    return await _gateway(request).search_memory(
        q, limit=limit, service_name=service_name
    )


@router.get("/llm/health", response_model=LlmHealthResponse)
async def llm_health(request: Request) -> LlmHealthResponse:
    return await _gateway(request).llm_health()
