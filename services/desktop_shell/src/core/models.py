"""Domain models for the Empery desktop shell."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class DesktopItem(BaseModel):
    id: str
    name: str
    type: Literal["folder", "file", "app"]
    position: dict[str, float] = Field(default_factory=lambda: {"x": 32.0, "y": 32.0})
    app_component: str | None = None
    icon: str | None = None
    category: str | None = None
    is_system: bool = False
    parent_id: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class DesktopConfig(BaseModel):
    wallpaper: str = "/wallpapers/default.svg"
    theme: Literal["dark", "light", "auto"] = "dark"
    accent_color: str = "signal"
    snap_to_grid: bool = True
    shell_state: dict[str, Any] = Field(default_factory=dict)


class InstalledAppsSlice(BaseModel):
    app_ids: list[str] = Field(default_factory=list)


class CatalogApp(BaseModel):
    """Registrable desktop app — autonomy / scaffolds POST here."""

    app_id: str
    title: str
    app_component: str
    category: str = "apps"
    description: str = ""
    icon: str | None = None
    enabled: bool = True
    user_created: bool = False


class ShellBootstrap(BaseModel):
    schema_version: int = 1
    desktop_config: DesktopConfig = Field(default_factory=DesktopConfig)
    installed: InstalledAppsSlice = Field(default_factory=InstalledAppsSlice)
    items: list[DesktopItem] = Field(default_factory=list)
    catalog: list[CatalogApp] = Field(default_factory=list)
