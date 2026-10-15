"""Nervas HTTP routes: generate/chat/reason/plan + runtime config + health."""

from __future__ import annotations

from fastapi import APIRouter, Request

from core.integration.nervas import (
    NervasChatRequest,
    NervasChatResponse,
    NervasGenerateRequest,
    NervasGenerateResponse,
    NervasPlanRequest,
    NervasPlanResponse,
    NervasReasonRequest,
    NervasReasonResponse,
)
from services.empery_intelligence_core.src.core.nervas.contracts import (
    EicHealthResponse,
)
from services.empery_intelligence_core.src.core.nervas.use_cases import NervasUseCases
from services.empery_intelligence_core.src.data.provider_config_store import (
    NervasRuntimeConfigUpdate,
    NervasRuntimeConfigView,
)

router = APIRouter(tags=["nervas"])


def _use_cases(request: Request) -> NervasUseCases:
    return request.app.state.container.resolve("nervas_use_cases")


@router.get("/health", response_model=EicHealthResponse)
async def health(request: Request) -> EicHealthResponse:
    uc = _use_cases(request)
    nervas_health = await uc.health()
    manifest = request.app.state.manifest
    return EicHealthResponse(
        status="ok" if nervas_health.ready else "degraded",
        service=manifest.name,
        version=manifest.version,
        nervas=nervas_health,
    )


@router.post("/nervas/generate", response_model=NervasGenerateResponse)
async def nervas_generate(
    body: NervasGenerateRequest,
    request: Request,
) -> NervasGenerateResponse:
    return await _use_cases(request).generate(body)


@router.post("/nervas/chat", response_model=NervasChatResponse)
async def nervas_chat(
    body: NervasChatRequest,
    request: Request,
) -> NervasChatResponse:
    return await _use_cases(request).chat(body)


@router.post("/nervas/reason", response_model=NervasReasonResponse)
async def nervas_reason(
    body: NervasReasonRequest,
    request: Request,
) -> NervasReasonResponse:
    return await _use_cases(request).reason(body)


@router.post("/nervas/plan", response_model=NervasPlanResponse)
async def nervas_plan(
    body: NervasPlanRequest,
    request: Request,
) -> NervasPlanResponse:
    return await _use_cases(request).plan(body)


@router.get("/nervas/config", response_model=NervasRuntimeConfigView)
async def get_nervas_config(request: Request) -> NervasRuntimeConfigView:
    return _use_cases(request).get_config()


@router.put("/nervas/config", response_model=NervasRuntimeConfigView)
async def put_nervas_config(
    body: NervasRuntimeConfigUpdate,
    request: Request,
) -> NervasRuntimeConfigView:
    return await _use_cases(request).update_config(body)
