"""Service-local Nervas DTOs — re-exports canonical core contracts + config views."""

from __future__ import annotations

from core.integration.nervas import (
    NervasBackendHealth,
    NervasBackendId,
    NervasChatRequest,
    NervasChatResponse,
    NervasGenerateRequest,
    NervasGenerateResponse,
    NervasMessage,
    NervasPlanRequest,
    NervasPlanResponse,
    NervasPlanStep,
    NervasProvider,
    NervasReasonRequest,
    NervasReasonResponse,
    NervasUsage,
)
from pydantic import BaseModel, ConfigDict
from services.empery_intelligence_core.src.data.provider_config_store import (
    NervasRuntimeConfigUpdate,
    NervasRuntimeConfigView,
)

__all__ = [
    "EicHealthResponse",
    "NervasBackendHealth",
    "NervasBackendId",
    "NervasChatRequest",
    "NervasChatResponse",
    "NervasGenerateRequest",
    "NervasGenerateResponse",
    "NervasMessage",
    "NervasPlanRequest",
    "NervasPlanResponse",
    "NervasPlanStep",
    "NervasProvider",
    "NervasReasonRequest",
    "NervasReasonResponse",
    "NervasRuntimeConfigUpdate",
    "NervasRuntimeConfigView",
    "NervasUsage",
]


class EicHealthResponse(BaseModel):
    """Service health including Nervas backend readiness."""

    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    nervas: NervasBackendHealth
