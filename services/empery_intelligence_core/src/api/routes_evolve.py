"""Evolve propose HTTP routes."""

from __future__ import annotations

from fastapi import APIRouter, Request

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_intelligence_core.src.integration.evolve_propose import (
    EvolveProposeRequest,
    EvolveProposeResponse,
    EvolveProposeUseCases,
)

router = APIRouter(tags=["evolve"])


def _uc(request: Request) -> EvolveProposeUseCases:
    container = request.app.state.container
    if not container.has("evolve_propose_use_cases"):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_EVOLVE_UNAVAILABLE",
                message="evolve_propose_use_cases not registered",
            ),
            http_status=503,
        )
    return container.resolve("evolve_propose_use_cases")


@router.post("/evolve/propose", response_model=EvolveProposeResponse)
async def evolve_propose(
    body: EvolveProposeRequest, request: Request
) -> EvolveProposeResponse:
    """Propose structured evolve options via Nervas for operator pick."""
    return await _uc(request).propose(body)
