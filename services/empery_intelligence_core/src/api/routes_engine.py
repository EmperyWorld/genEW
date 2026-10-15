"""Legacy headless Engine routes — permanently retired (410 Gone).

Production path is Autonomous intentions → Hands agent_loop → VerifierPort.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_intelligence_core.src.core.engine.contracts import (
    EngineCycleStartRequest,
)

router = APIRouter(tags=["engine"])

_ENGINE_GONE = StandardizedErrorResponse(
    error_code="EIC_ENGINE_GONE",
    message=(
        "Headless /engine/cycles is permanently retired. "
        "Use POST /api/v1/autonomous/intentions (Hands + VerifierPort)."
    ),
    details={
        "replacement": "/api/v1/autonomous/intentions",
        "reason": "LLM-prose verify soft-PASSED; dual truth with factory gates",
    },
)


def _gone() -> None:
    raise ServiceError(_ENGINE_GONE, http_status=410)


@router.post("/engine/cycles")
async def start_cycle(
    body: EngineCycleStartRequest,
    request: Request,
) -> None:
    """Retired — always 410 Gone."""
    del body, request
    _gone()


@router.get("/engine/cycles/{cycle_id}")
async def get_cycle(cycle_id: str, request: Request) -> None:
    """Retired — always 410 Gone."""
    del cycle_id, request
    _gone()
