"""ECC BFF — proxy service lifecycle enable/disable/delete to EIC."""

from __future__ import annotations

from enum import Enum
from typing import Any

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from core.errors import ServiceError, StandardizedErrorResponse

router = APIRouter(prefix="/factory", tags=["factory"])


class LifecycleAction(str, Enum):
    ENABLE = "enable"
    DISABLE = "disable"
    DELETE = "delete"


class LifecycleRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    action: LifecycleAction


class LifecycleResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    ok: bool
    service_name: str
    action: LifecycleAction
    result: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class LifecycleMetaResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    service_name: str
    user_created: bool
    seed_product: bool
    deletable: bool
    force_delete_env: bool = False
    ghost: bool = False


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


@router.get(
    "/services/{service_name}/lifecycle-meta",
    response_model=LifecycleMetaResponse,
)
async def service_lifecycle_meta(
    service_name: str,
    request: Request,
) -> LifecycleMetaResponse:
    url = (
        f"{_eic_base(request)}/api/v1/factory/services/{service_name}/lifecycle-meta"
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(url)
    except httpx.HTTPError as exc:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_EIC_UNAVAILABLE",
                message=f"EIC lifecycle meta proxy failed: {exc}",
            ),
            http_status=502,
        ) from exc
    if res.status_code >= 400:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_LIFECYCLE_FAILED",
                message=res.text[:500] or f"EIC returned {res.status_code}",
            ),
            http_status=res.status_code if res.status_code < 500 else 502,
        )
    data = res.json() if res.content else {}
    if not isinstance(data, dict):
        data = {}
    return LifecycleMetaResponse(
        service_name=str(data.get("service_name") or service_name),
        user_created=bool(data.get("user_created")),
        seed_product=bool(data.get("seed_product")),
        deletable=bool(data.get("deletable")),
        force_delete_env=bool(data.get("force_delete_env")),
        ghost=bool(data.get("ghost")),
    )


@router.post(
    "/services/{service_name}/lifecycle",
    response_model=LifecycleResponse,
)
async def service_lifecycle(
    service_name: str,
    body: LifecycleRequest,
    request: Request,
) -> LifecycleResponse:
    url = (
        f"{_eic_base(request)}/api/v1/factory/services/{service_name}/lifecycle"
    )
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(url, json={"action": body.action.value})
    except httpx.HTTPError as exc:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_EIC_UNAVAILABLE",
                message=f"EIC lifecycle proxy failed: {exc}",
            ),
            http_status=502,
        ) from exc
    if res.status_code >= 400:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_LIFECYCLE_FAILED",
                message=res.text[:500] or f"EIC returned {res.status_code}",
            ),
            http_status=res.status_code if res.status_code < 500 else 502,
        )
    data = res.json() if res.content else {}
    if not isinstance(data, dict):
        data = {}
    return LifecycleResponse(
        ok=bool(data.get("ok")),
        service_name=str(data.get("service_name") or service_name),
        action=body.action,
        result=dict(data.get("result") or {}),
        error=data.get("error"),
    )
