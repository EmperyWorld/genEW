"""Use cases for desktop_shell."""

from __future__ import annotations

from datetime import datetime, timezone

from core.container import ServiceContainer
from core.event_bus import Event
from services.desktop_shell.src.core.models import (
    CatalogApp,
    DesktopItem,
    ShellBootstrap,
)


class DesktopShellUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container
        self._event_bus = container.resolve("event_bus")

    def health(self) -> dict[str, str]:
        return {"status": "ok", "service": "desktop_shell"}

    def bootstrap(self) -> ShellBootstrap:
        store = self._container.resolve("desktop_shell_store")
        return store.bootstrap()

    async def publish_shell_bootstrapped(self) -> None:
        """Emit once after bus start — matches manifest publishes."""
        await self._event_bus.publish(
            Event(
                name="desktop.shell.bootstrapped",
                payload={"service": "desktop_shell"},
                occurred_at=datetime.now(timezone.utc).isoformat(),
                source="desktop_shell",
            )
        )

    def list_items(self) -> list[DesktopItem]:
        store = self._container.resolve("desktop_shell_store")
        return store.list_items()

    def list_catalog(self) -> list[CatalogApp]:
        store = self._container.resolve("desktop_shell_store")
        return store.list_catalog()

    async def _publish_items_changed(self, app_id: str, action: str) -> None:
        await self._event_bus.publish(
            Event(
                name="desktop.items.changed",
                payload={"app_id": app_id, "action": action},
                occurred_at=datetime.now(timezone.utc).isoformat(),
                source="desktop_shell",
            )
        )

    async def register_catalog_app(self, app: CatalogApp) -> CatalogApp:
        store = self._container.resolve("desktop_shell_store")
        result = store.register_catalog_app(app)
        await self._publish_items_changed(app.app_id, "register")
        return result

    async def set_catalog_enabled(self, app_id: str, *, enabled: bool) -> CatalogApp:
        from core.errors import ServiceError, StandardizedErrorResponse

        store = self._container.resolve("desktop_shell_store")
        updated = store.set_catalog_enabled(app_id, enabled=enabled)
        if updated is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="DESKTOP_SHELL_NOT_FOUND",
                    message=f"catalog app not found: {app_id}",
                ),
                http_status=404,
            )
        action = "enable" if enabled else "disable"
        await self._publish_items_changed(app_id, action)
        return updated

    async def remove_catalog_app(self, app_id: str) -> dict[str, object]:
        from core.errors import ServiceError, StandardizedErrorResponse

        store = self._container.resolve("desktop_shell_store")
        ok = store.remove_catalog_app(app_id)
        if not ok:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="DESKTOP_SHELL_NOT_FOUND",
                    message=f"catalog app not found: {app_id}",
                ),
                http_status=404,
            )
        await self._publish_items_changed(app_id, "delete")
        return {"ok": True, "app_id": app_id, "removed": True}
