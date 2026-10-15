"""HTTP routes for desktop_shell."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from services.desktop_shell.src.core.use_cases import DesktopShellUseCases
from services.desktop_shell.src.data.schemas import (
    CatalogApp,
    DesktopItem,
    ShellBootstrap,
)

router = APIRouter()


class CatalogEnabledPatch(BaseModel):
    model_config = ConfigDict(frozen=True)

    enabled: bool = Field(..., description="Show/hide app on desktop")


def _uc(request: Request) -> DesktopShellUseCases:
    return request.app.state.container.resolve("desktop_shell_use_cases")


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    return _uc(request).health()


@router.get("/shell-bootstrap", response_model=ShellBootstrap)
async def shell_bootstrap(request: Request) -> ShellBootstrap:
    return _uc(request).bootstrap()


@router.get("/items", response_model=list[DesktopItem])
async def list_items(request: Request) -> list[DesktopItem]:
    return _uc(request).list_items()


@router.get("/catalog/apps", response_model=list[CatalogApp])
async def list_catalog(request: Request) -> list[CatalogApp]:
    return _uc(request).list_catalog()


@router.post("/catalog/apps", response_model=CatalogApp)
async def register_catalog_app(request: Request, body: CatalogApp) -> CatalogApp:
    return await _uc(request).register_catalog_app(body)


@router.patch("/catalog/apps/{app_id}", response_model=CatalogApp)
async def set_catalog_enabled(
    request: Request, app_id: str, body: CatalogEnabledPatch
) -> CatalogApp:
    return await _uc(request).set_catalog_enabled(app_id, enabled=body.enabled)


@router.delete("/catalog/apps/{app_id}")
async def remove_catalog_app(request: Request, app_id: str) -> dict:
    return await _uc(request).remove_catalog_app(app_id)
