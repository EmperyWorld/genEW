"""Desktop shell store — in-memory items/config + durable Postgres catalog."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from sqlalchemy import func, select

from core.data.database import DatabaseManager
from services.desktop_shell.src.core.models import (
    CatalogApp,
    DesktopConfig,
    DesktopItem,
    InstalledAppsSlice,
    ShellBootstrap,
)
from services.desktop_shell.src.data.orm import CatalogAppRow

_logger = logging.getLogger("desktop_shell.store")

# Probe / scaffold / smoke debris — never show on default Desktop launch (P4.1 / P10).
# Overlays for these live under desktop_catalog/lab/ (not auto-loaded).
LAUNCH_EXCLUDED_APP_IDS = frozenset(
    {
        "recipe_probe_svc",
        "unnamed_service",
    }
)
_SMOKE_LAB_APP_RE = re.compile(r"^(p4_golden_|p8_notes_|p15_refuse_)\d")


def is_launch_excluded_app_id(app_id: str) -> bool:
    """Exclude probes and timestamped golden/notes/refuse smoke capsules from launch catalog."""
    aid = (app_id or "").strip()
    if aid in LAUNCH_EXCLUDED_APP_IDS:
        return True
    return bool(_SMOKE_LAB_APP_RE.match(aid))


def _seed_catalog() -> list[CatalogApp]:
    return [
        CatalogApp(
            app_id="control_center",
            title="Control Center",
            app_component="control_center",
            category="system",
            description="Ops map, health, registry",
        ),
        CatalogApp(
            app_id="autonomous",
            title="Autonomous",
            app_component="autonomous",
            category="system",
            description="Native Autonomous queue via ECC BFF (no iframe)",
        ),
        CatalogApp(
            app_id="doc_editor",
            title="Doc Editor",
            app_component="doc_editor",
            category="productivity",
            description="TipTap document editor + Nervas Improve/Rewrite",
        ),
        CatalogApp(
            app_id="image_studio",
            title="Image Studio",
            app_component="image_studio",
            category="creative",
            description="Creative studio seed (assemble from studios recipe)",
        ),
        CatalogApp(
            app_id="video_studio",
            title="Video Studio",
            app_component="video_studio",
            category="creative",
            description="Wan 2.2 image-to-video via video_studio → ComfyUI",
        ),
        CatalogApp(
            app_id="music_forge",
            title="MusicForge",
            app_component="music_forge",
            category="creative",
            description="AceStep 1.5 text-to-music via music_forge → ComfyUI",
        ),
        CatalogApp(
            app_id="ewa_companion",
            title="EWA Companion",
            app_component="ewa_companion",
            category="assistant",
            description="Companion slim dock seed (assemble from ewa_companion recipe)",
        ),
        CatalogApp(
            app_id="site_studio",
            title="Site Studio",
            app_component="site_studio",
            category="creative",
            description="Site Studio HTML preview via Nervas (no admin/provisioning)",
        ),
        CatalogApp(
            app_id="workspace",
            title="Workspace",
            app_component="workspace",
            category="system",
            description="Creative hub launcher for Companion, studios, docs, and ops",
        ),
    ]


def _seed_items() -> list[DesktopItem]:
    return [
        DesktopItem(
            id="app-ops",
            name="Control Center",
            type="app",
            position={"x": 48, "y": 48},
            app_component="control_center",
            category="system",
            is_system=True,
        ),
        DesktopItem(
            id="app-autonomous",
            name="Autonomous",
            type="app",
            position={"x": 48, "y": 160},
            app_component="autonomous",
            category="system",
            is_system=True,
        ),
        DesktopItem(
            id="app-doc-editor",
            name="Doc Editor",
            type="app",
            position={"x": 48, "y": 272},
            app_component="doc_editor",
            category="productivity",
            is_system=True,
        ),
        DesktopItem(
            id="app-image-studio",
            name="Image Studio",
            type="app",
            position={"x": 48, "y": 384},
            app_component="image_studio",
            category="creative",
            is_system=True,
        ),
        DesktopItem(
            id="app-video-studio",
            name="Video Studio",
            type="app",
            position={"x": 48, "y": 496},
            app_component="video_studio",
            category="creative",
            is_system=True,
        ),
        DesktopItem(
            id="app-music-forge",
            name="MusicForge",
            type="app",
            position={"x": 48, "y": 608},
            app_component="music_forge",
            category="creative",
            is_system=True,
        ),
        DesktopItem(
            id="app-ewa-companion",
            name="EWA Companion",
            type="app",
            position={"x": 48, "y": 720},
            app_component="ewa_companion",
            category="assistant",
            is_system=True,
        ),
        DesktopItem(
            id="app-site-studio",
            name="Site Studio",
            type="app",
            position={"x": 160, "y": 48},
            app_component="site_studio",
            category="creative",
            is_system=True,
        ),
        DesktopItem(
            id="app-workspace",
            name="Workspace",
            type="app",
            position={"x": 160, "y": 160},
            app_component="workspace",
            category="system",
            is_system=True,
        ),
    ]


def load_catalog_overlays(catalog_dir: str | Path | None) -> list[CatalogApp]:
    """Load launch overlays from catalog_dir/*.json (not lab/ subdirectory)."""
    if not catalog_dir:
        return []
    root = Path(catalog_dir)
    if not root.is_dir():
        return []
    apps: list[CatalogApp] = []
    for path in sorted(root.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            app = CatalogApp.model_validate(raw)
            if is_launch_excluded_app_id(app.app_id) or not app.enabled:
                _logger.info(
                    "skip lab/disabled overlay %s (app_id=%s)",
                    path.name,
                    app.app_id,
                )
                continue
            apps.append(app)
        except Exception:  # noqa: BLE001
            _logger.warning("skip invalid desktop catalog file %s", path, exc_info=True)
    return apps


class InMemoryDesktopShellStore:
    def __init__(self, catalog_dir: str | Path | None = None) -> None:
        self._catalog_dir = Path(catalog_dir) if catalog_dir else None
        self._items = _seed_items()
        self._catalog = _seed_catalog()
        self._config = DesktopConfig()
        self._installed = InstalledAppsSlice(
            app_ids=[c.app_id for c in self._catalog]
        )
        self._reload_catalog_overlays()
        self._purge_launch_excluded()

    def _purge_launch_excluded(self) -> None:
        """Drop probe/scaffold/smoke apps from launch catalog and desktop icons."""
        for app in list(self._catalog):
            if is_launch_excluded_app_id(app.app_id):
                self.remove_catalog_app(app.app_id)
                _logger.info("purged launch-excluded catalog app %s", app.app_id)

    def _reload_catalog_overlays(self) -> None:
        """Idempotently merge JSON catalog overlays from disk."""
        if self._catalog_dir is None:
            return
        for app in load_catalog_overlays(self._catalog_dir):
            self.register_catalog_app(app)

    def bootstrap(self) -> ShellBootstrap:
        self._reload_catalog_overlays()
        self._purge_launch_excluded()
        enabled = [c for c in self._catalog if c.enabled]
        enabled_ids = {c.app_id for c in enabled}
        items = [
            i
            for i in self._items
            if i.app_component is None
            or any(
                c.app_component == i.app_component and c.enabled for c in self._catalog
            )
            or i.is_system
        ]
        # System seed icons stay; overlay-only disabled apps already purged from items.
        installed = InstalledAppsSlice(
            app_ids=[i for i in self._installed.app_ids if i in enabled_ids]
        )
        return ShellBootstrap(
            desktop_config=self._config,
            installed=installed,
            items=items,
            catalog=enabled,
        )

    def list_items(self) -> list[DesktopItem]:
        return list(self._items)

    def list_catalog(self) -> list[CatalogApp]:
        return [c for c in self._catalog if c.enabled]

    def register_catalog_app(self, app: CatalogApp) -> CatalogApp:
        if is_launch_excluded_app_id(app.app_id):
            _logger.info(
                "refusing in-memory register of launch-excluded app %s",
                app.app_id,
            )
            self.remove_catalog_app(app.app_id)
            return app
        existing = next((c for c in self._catalog if c.app_id == app.app_id), None)
        if existing:
            self._catalog = [
                app if c.app_id == app.app_id else c for c in self._catalog
            ]
            # Keep desktop icon label in sync with catalog title (genesis often
            # first-registers a long intention string as title).
            if app.enabled:
                self._items = [
                    (
                        item.model_copy(
                            update={
                                "name": app.title,
                                "category": app.category or item.category,
                            }
                        )
                        if item.app_component == app.app_component
                        else item
                    )
                    for item in self._items
                ]
            else:
                self._installed = InstalledAppsSlice(
                    app_ids=[i for i in self._installed.app_ids if i != app.app_id]
                )
                self._items = [
                    i for i in self._items if i.app_component != app.app_component
                ]
        else:
            self._catalog.append(app)
            if app.enabled:
                if app.app_id not in self._installed.app_ids:
                    self._installed = InstalledAppsSlice(
                        app_ids=[*self._installed.app_ids, app.app_id]
                    )
                if not any(i.app_component == app.app_component for i in self._items):
                    idx = len([i for i in self._items if i.type == "app"])
                    self._items.append(
                        DesktopItem(
                            id=f"app-{app.app_id}",
                            name=app.title,
                            type="app",
                            position={"x": 48.0, "y": 48.0 + idx * 112.0},
                            app_component=app.app_component,
                            category=app.category,
                            is_system=False,
                        )
                    )
        return app

    def set_catalog_enabled(self, app_id: str, *, enabled: bool) -> CatalogApp | None:
        existing = next((c for c in self._catalog if c.app_id == app_id), None)
        if existing is None:
            return None
        updated = existing.model_copy(update={"enabled": enabled})
        self._catalog = [
            updated if c.app_id == app_id else c for c in self._catalog
        ]
        if not enabled:
            # Hide from installed slice while keeping catalog record.
            self._installed = InstalledAppsSlice(
                app_ids=[i for i in self._installed.app_ids if i != app_id]
            )
            self._items = [
                i for i in self._items if i.app_component != updated.app_component
            ]
        elif app_id not in self._installed.app_ids:
            self._installed = InstalledAppsSlice(
                app_ids=[*self._installed.app_ids, app_id]
            )
            if not any(i.app_component == updated.app_component for i in self._items):
                idx = len([i for i in self._items if i.type == "app"])
                self._items.append(
                    DesktopItem(
                        id=f"app-{app_id}",
                        name=updated.title,
                        type="app",
                        position={"x": 48.0, "y": 48.0 + idx * 112.0},
                        app_component=updated.app_component,
                        category=updated.category,
                        is_system=False,
                    )
                )
        return updated

    def remove_catalog_app(self, app_id: str) -> bool:
        before = len(self._catalog)
        target = next((c for c in self._catalog if c.app_id == app_id), None)
        self._catalog = [c for c in self._catalog if c.app_id != app_id]
        self._installed = InstalledAppsSlice(
            app_ids=[i for i in self._installed.app_ids if i != app_id]
        )
        if target is not None:
            self._items = [
                i for i in self._items if i.app_component != target.app_component
            ]
        return len(self._catalog) < before


def _row_to_catalog_app(row: CatalogAppRow) -> CatalogApp:
    return CatalogApp(
        app_id=row.app_id,
        title=row.title,
        app_component=row.app_component,
        category=row.category,
        description=row.description,
        icon=row.icon,
        enabled=row.enabled,
        user_created=False,
    )


def _catalog_app_to_row(app: CatalogApp) -> CatalogAppRow:
    return CatalogAppRow(
        app_id=app.app_id,
        title=app.title,
        app_component=app.app_component,
        category=app.category,
        description=app.description,
        icon=app.icon,
        enabled=app.enabled,
    )


def _reset_memory_catalog(mem: InMemoryDesktopShellStore, apps: list[CatalogApp]) -> None:
    """Rebuild in-memory catalog/items/installed from a catalog snapshot."""
    mem._catalog = []
    mem._items = _seed_items()
    mem._installed = InstalledAppsSlice(app_ids=[])
    for app in apps:
        mem.register_catalog_app(app)


class PostgresDesktopShellStore:
    """Postgres-backed catalog with in-memory items/config and overlay merge."""

    def __init__(
        self,
        database: DatabaseManager,
        catalog_dir: str | Path | None = None,
    ) -> None:
        self._db = database
        self._catalog_dir = Path(catalog_dir) if catalog_dir else None
        self._mem = InMemoryDesktopShellStore(catalog_dir=None)
        self._bootstrap_catalog_from_db()
        if self._catalog_dir is not None:
            self._mem._catalog_dir = self._catalog_dir
        self._reload_catalog_overlays()
        self._purge_launch_excluded()

    def _purge_launch_excluded(self) -> None:
        for app in list(self._mem._catalog):
            if is_launch_excluded_app_id(app.app_id):
                if self._mem.remove_catalog_app(app.app_id):
                    self._delete_catalog_row(app.app_id)
                    _logger.info(
                        "purged launch-excluded catalog app %s from db",
                        app.app_id,
                    )

    def _bootstrap_catalog_from_db(self) -> None:
        with self._db.session_scope() as session:
            count = session.scalar(
                select(func.count()).select_from(CatalogAppRow)
            )
            if not count:
                for app in _seed_catalog():
                    session.add(_catalog_app_to_row(app))
                session.flush()
            rows = list(session.scalars(select(CatalogAppRow)).all())
        _reset_memory_catalog(self._mem, [_row_to_catalog_app(r) for r in rows])

    def _upsert_catalog_row(self, app: CatalogApp) -> None:
        with self._db.session_scope() as session:
            row = session.get(CatalogAppRow, app.app_id)
            if row is None:
                session.add(_catalog_app_to_row(app))
            else:
                row.title = app.title
                row.app_component = app.app_component
                row.category = app.category
                row.description = app.description
                row.icon = app.icon
                row.enabled = app.enabled

    def _delete_catalog_row(self, app_id: str) -> None:
        with self._db.session_scope() as session:
            row = session.get(CatalogAppRow, app_id)
            if row is not None:
                session.delete(row)

    def _reload_catalog_overlays(self) -> None:
        """Idempotently merge JSON catalog overlays from disk and persist."""
        if self._catalog_dir is None:
            return
        for app in load_catalog_overlays(self._catalog_dir):
            self.register_catalog_app(app)

    def bootstrap(self) -> ShellBootstrap:
        self._reload_catalog_overlays()
        self._purge_launch_excluded()
        return self._mem.bootstrap()

    def list_items(self) -> list[DesktopItem]:
        return self._mem.list_items()

    def list_catalog(self) -> list[CatalogApp]:
        return self._mem.list_catalog()

    def register_catalog_app(self, app: CatalogApp) -> CatalogApp:
        if is_launch_excluded_app_id(app.app_id):
            _logger.info(
                "refusing to register launch-excluded app %s", app.app_id
            )
            self._mem.remove_catalog_app(app.app_id)
            self._delete_catalog_row(app.app_id)
            return app
        result = self._mem.register_catalog_app(app)
        self._upsert_catalog_row(result)
        return result

    def set_catalog_enabled(self, app_id: str, *, enabled: bool) -> CatalogApp | None:
        updated = self._mem.set_catalog_enabled(app_id, enabled=enabled)
        if updated is not None:
            self._upsert_catalog_row(updated)
        return updated

    def remove_catalog_app(self, app_id: str) -> bool:
        ok = self._mem.remove_catalog_app(app_id)
        if ok:
            self._delete_catalog_row(app_id)
        return ok
