"""Headless engine application use cases — retired (410 Gone)."""

from __future__ import annotations

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_intelligence_core.src.core.engine.contracts import (
    EngineCycleAccepted,
    EngineCycleStartRequest,
    EngineCycleStatus,
)

_ENGINE_GONE = StandardizedErrorResponse(
    error_code="EIC_ENGINE_GONE",
    message=(
        "Headless /engine/cycles is permanently retired. "
        "Use POST /api/v1/autonomous/intentions (Hands + VerifierPort)."
    ),
    details={"replacement": "/api/v1/autonomous/intentions"},
)


class HeadlessEngineUseCases:
    """API-facing engine operations — always fail-closed as Gone."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    async def start_cycle(
        self, request: EngineCycleStartRequest
    ) -> EngineCycleAccepted:
        del request
        raise ServiceError(_ENGINE_GONE, http_status=410)

    async def run_cycle(
        self, request: EngineCycleStartRequest
    ) -> EngineCycleStatus:
        del request
        raise ServiceError(_ENGINE_GONE, http_status=410)

    def get_cycle(self, cycle_id: str) -> EngineCycleStatus:
        del cycle_id
        raise ServiceError(_ENGINE_GONE, http_status=410)
