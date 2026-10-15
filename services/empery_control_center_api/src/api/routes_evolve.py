"""ECC BFF — proxy evolve propose to EIC."""

from __future__ import annotations

from typing import Any, Literal

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.errors import ServiceError, StandardizedErrorResponse

router = APIRouter(prefix="/evolve", tags=["evolve"])

_SERVICE_RE = __import__("re").compile(r"^[a-z][a-z0-9_]{1,62}$")


class EvolveProposeRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    service_name: str = Field(min_length=2, max_length=63)
    intent: str = Field(min_length=1, max_length=20000)
    option_count: int = Field(default=3, ge=2, le=5)

    @field_validator("service_name")
    @classmethod
    def _svc(cls, value: str) -> str:
        if not _SERVICE_RE.fullmatch(value):
            raise ValueError("invalid service_name")
        return value


class EvolveOptionDTO(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    title: str
    delta_summary: str
    risk: Literal["low", "medium", "high"] = "medium"
    touches: list[str] = Field(default_factory=list)


class EvolveProposeResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    proposal_id: str
    service_name: str
    intent: str
    options: list[EvolveOptionDTO]
    persisted_path: str | None = None
    backend: str | None = None


def _eic_base(request: Request) -> str:
    config = getattr(request.app.state, "config", None)
    base = str(getattr(config, "eic_api_base", "") or "").strip().rstrip("/")
    if not base:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_EIC_UNAVAILABLE",
                message="EIC_API_BASE unset",
            ),
            http_status=503,
        )
    return base


@router.post("/propose", response_model=EvolveProposeResponse)
async def evolve_propose(
    body: EvolveProposeRequest, request: Request
) -> EvolveProposeResponse:
    url = f"{_eic_base(request)}/api/v1/evolve/propose"
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            res = await client.post(
                url,
                json={
                    "service_name": body.service_name,
                    "intent": body.intent,
                    "option_count": body.option_count,
                },
            )
    except httpx.HTTPError as exc:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_EIC_UNAVAILABLE",
                message=f"EIC evolve propose failed: {exc}",
            ),
            http_status=502,
        ) from exc
    if res.status_code >= 400:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_EVOLVE_PROPOSE_FAILED",
                message=res.text[:500] or f"EIC returned {res.status_code}",
            ),
            http_status=res.status_code if res.status_code < 500 else 502,
        )
    data: dict[str, Any] = res.json() if res.content else {}
    return EvolveProposeResponse.model_validate(data)
