"""Internal ops endpoints for ECC API (hot reload, etc.)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from services.empery_control_center_api.src.integration.bff_hot_reload import (
    reload_stamped_bff_routes,
)

router = APIRouter(prefix="/ops", tags=["ops"])


class BffReloadResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    ok: bool
    reload_mode: str = "hot"
    services: list[str] = Field(default_factory=list)
    mounted: list[str] = Field(default_factory=list)
    errors: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/reload-bff-routes", response_model=BffReloadResponse)
async def reload_bff_routes(request: Request) -> BffReloadResponse:
    """Re-import Hands-stamped BFF routers + DI without killing the process."""
    logger = request.app.state.container.resolve("logger")
    result = reload_stamped_bff_routes(request.app, logger=logger)
    return BffReloadResponse(
        ok=bool(result.get("ok")),
        reload_mode=str(result.get("reload_mode") or "hot"),
        services=list(result.get("services") or []),
        mounted=list(result.get("mounted") or []),
        errors=list(result.get("errors") or []),
    )
