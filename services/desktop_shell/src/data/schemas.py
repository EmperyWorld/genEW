"""API schemas for desktop_shell (re-export domain for boundary)."""

from services.desktop_shell.src.core.models import (
    CatalogApp,
    DesktopConfig,
    DesktopItem,
    InstalledAppsSlice,
    ShellBootstrap,
)

__all__ = [
    "CatalogApp",
    "DesktopConfig",
    "DesktopItem",
    "InstalledAppsSlice",
    "ShellBootstrap",
]
