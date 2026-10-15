"""Factory lifecycle HTTP routes — enable / disable / delete services."""

from __future__ import annotations

from enum import Enum
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_intelligence_core.src.integration.service_factory_lifecycle import (
    lifecycle_delete_meta,
)

router = APIRouter(tags=["factory"])


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


def _workspace_tools(request: Request):
    container = request.app.state.container
    if not container.has("workspace_tools"):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_WORKSPACE_UNAVAILABLE",
                message="workspace_tools not registered",
            ),
            http_status=503,
        )
    return container.resolve("workspace_tools")


@router.get(
    "/factory/services/{service_name}/lifecycle-meta",
    response_model=LifecycleMetaResponse,
)
async def service_lifecycle_meta(
    service_name: str,
    request: Request,
) -> LifecycleMetaResponse:
    """Return delete-gate metadata (user_created / seed product / deletable)."""
    from pathlib import Path

    tools = _workspace_tools(request)
    workspace = Path(tools._workspace())  # noqa: SLF001
    try:
        meta = lifecycle_delete_meta(workspace, service_name)
    except ValueError as exc:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_LIFECYCLE_FORBIDDEN",
                message=str(exc),
            ),
            http_status=400,
        ) from exc
    return LifecycleMetaResponse(
        service_name=str(meta["service_name"]),
        user_created=bool(meta["user_created"]),
        seed_product=bool(meta["seed_product"]),
        deletable=bool(meta["deletable"]),
        force_delete_env=bool(meta.get("force_delete_env")),
        ghost=bool(meta.get("ghost")),
    )


@router.post(
    "/factory/services/{service_name}/lifecycle",
    response_model=LifecycleResponse,
)
async def service_lifecycle(
    service_name: str,
    body: LifecycleRequest,
    request: Request,
) -> LifecycleResponse:
    """Enable, disable, or delete a non-spine Empery service (production path)."""
    tools = _workspace_tools(request)
    try:
        if body.action is LifecycleAction.ENABLE:
            result = tools.set_service_enabled(service_name, enabled=True)
        elif body.action is LifecycleAction.DISABLE:
            result = tools.set_service_enabled(service_name, enabled=False)
        else:
            result = tools.teardown_service(service_name)
        return LifecycleResponse(
            ok=bool(result.get("ok")),
            service_name=service_name,
            action=body.action,
            result=result if isinstance(result, dict) else {},
            error=(
                None
                if result.get("ok")
                else str(
                    result.get("error")
                    or "; ".join(
                        str(x)
                        for x in (
                            (result.get("files") or {}).get("hard_errors")
                            or (result.get("files") or {}).get("errors")
                            or []
                        )
                    )
                    or "failed"
                )
            ),
        )
    except ValueError as exc:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_LIFECYCLE_FORBIDDEN",
                message=str(exc),
            ),
            http_status=400,
        ) from exc
