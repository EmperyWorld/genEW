"""HTTP routes for EIC Reflexes Intention queue."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request

from services.empery_intelligence_core.src.core.reflexes.models import (
    IntentionKind,
    IntentionStatus,
)
from services.empery_intelligence_core.src.core.reflexes.use_cases import ReflexesUseCases
from services.empery_intelligence_core.src.data.schemas import (
    IntentionEnqueueRequest,
    IntentionListResponse,
    IntentionResponse,
    WorkerHealthResponse,
)

router = APIRouter(tags=["eic-reflexes"])


def _use_cases(request: Request) -> ReflexesUseCases:
    return request.app.state.container.resolve("eic_reflexes_use_cases")


UseCasesDep = Annotated[ReflexesUseCases, Depends(_use_cases)]


@router.post("/intentions", response_model=IntentionResponse, status_code=201)
async def enqueue_intention(
    body: IntentionEnqueueRequest,
    uc: UseCasesDep,
) -> IntentionResponse:
    return await uc.enqueue(body)


@router.get("/intentions", response_model=IntentionListResponse)
async def list_intentions(
    uc: UseCasesDep,
    status: IntentionStatus | None = Query(default=None),
    kind: IntentionKind | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> IntentionListResponse:
    return await uc.list(status=status, kind=kind, limit=limit)


@router.get("/intentions/{intention_id}", response_model=IntentionResponse)
async def get_intention(
    intention_id: UUID,
    uc: UseCasesDep,
) -> IntentionResponse:
    return await uc.get(intention_id)


@router.post("/intentions/{intention_id}/pause", response_model=IntentionResponse)
async def pause_intention(
    intention_id: UUID,
    uc: UseCasesDep,
) -> IntentionResponse:
    return await uc.pause(intention_id)


@router.post("/intentions/{intention_id}/resume", response_model=IntentionResponse)
async def resume_intention(
    intention_id: UUID,
    uc: UseCasesDep,
) -> IntentionResponse:
    return await uc.resume(intention_id)


@router.post("/intentions/{intention_id}/cancel", response_model=IntentionResponse)
async def cancel_intention(
    intention_id: UUID,
    uc: UseCasesDep,
) -> IntentionResponse:
    return await uc.cancel(intention_id)


@router.get("/worker/health", response_model=WorkerHealthResponse)
async def worker_health(uc: UseCasesDep) -> WorkerHealthResponse:
    return await uc.worker_health()
