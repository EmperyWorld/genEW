"""PostgresDesktopShellStore catalog persistence (sqlite in tests)."""

from __future__ import annotations

from pathlib import Path

from core.data.database import DatabaseManager
from services.desktop_shell.src.core.models import CatalogApp
from services.desktop_shell.src.data.orm import Base
from services.desktop_shell.src.data.repository import (
    InMemoryDesktopShellStore,
    PostgresDesktopShellStore,
    _seed_catalog,
)


def _sqlite_db() -> DatabaseManager:
    db = DatabaseManager.from_url("sqlite+pysqlite:///:memory:")
    db.create_all(Base.metadata)
    return db


def test_postgres_store_seeds_empty_db() -> None:
    db = _sqlite_db()
    store = PostgresDesktopShellStore(db)
    catalog_ids = {c.app_id for c in store.list_catalog()}
    seed_ids = {c.app_id for c in _seed_catalog()}
    assert seed_ids <= catalog_ids


def test_register_persists_across_store_instances() -> None:
    db = _sqlite_db()
    store1 = PostgresDesktopShellStore(db)
    store1.register_catalog_app(
        CatalogApp(
            app_id="persist_me",
            title="Persist Me",
            app_component="persist_me",
            category="apps",
            description="durable",
        )
    )

    store2 = PostgresDesktopShellStore(db)
    catalog_ids = [c.app_id for c in store2.list_catalog()]
    assert "persist_me" in catalog_ids
    assert any(i.app_component == "persist_me" for i in store2.list_items())


def test_patch_and_delete_persist() -> None:
    db = _sqlite_db()
    store = PostgresDesktopShellStore(db)
    store.register_catalog_app(
        CatalogApp(
            app_id="toggle_me",
            title="Toggle",
            app_component="toggle_me",
        )
    )
    updated = store.set_catalog_enabled("toggle_me", enabled=False)
    assert updated is not None
    assert updated.enabled is False
    # Disabled apps are hidden from launch list_catalog (P4.1).
    assert "toggle_me" not in [c.app_id for c in store.list_catalog()]

    reloaded = PostgresDesktopShellStore(db)
    assert "toggle_me" not in [c.app_id for c in reloaded.list_catalog()]
    raw = next(c for c in reloaded._mem._catalog if c.app_id == "toggle_me")
    assert raw.enabled is False

    assert reloaded.remove_catalog_app("toggle_me") is True
    again = PostgresDesktopShellStore(db)
    assert "toggle_me" not in [c.app_id for c in again.list_catalog()]


def test_launch_excludes_probe_apps(tmp_path: Path) -> None:
    from services.desktop_shell.src.data.repository import LAUNCH_EXCLUDED_APP_IDS

    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    (catalog_dir / "recipe_probe_svc.json").write_text(
        '{"app_id":"recipe_probe_svc","title":"Probe","app_component":"recipe_probe_svc",'
        '"category":"apps","description":"lab"}\n',
        encoding="utf-8",
    )
    (catalog_dir / "p4_golden_20260725014206.json").write_text(
        '{"app_id":"p4_golden_20260725014206","title":"Smoke","app_component":'
        '"p4_golden_20260725014206","category":"apps","description":"smoke",'
        '"enabled":true}\n',
        encoding="utf-8",
    )
    (catalog_dir / "good_app.json").write_text(
        '{"app_id":"good_app","title":"Good","app_component":"good_app",'
        '"category":"apps","description":"ok"}\n',
        encoding="utf-8",
    )
    db = _sqlite_db()
    # Simulate durable probe row from a prior genesis.
    with db.session_scope() as session:
        from services.desktop_shell.src.data.orm import CatalogAppRow

        for app in _seed_catalog():
            session.add(
                CatalogAppRow(
                    app_id=app.app_id,
                    title=app.title,
                    app_component=app.app_component,
                    category=app.category,
                    description=app.description,
                    enabled=True,
                    icon=None,
                )
            )
        session.add(
            CatalogAppRow(
                app_id="recipe_probe_svc",
                title="Probe",
                app_component="recipe_probe_svc",
                category="apps",
                description="lab",
                enabled=True,
                icon=None,
            )
        )
        session.add(
            CatalogAppRow(
                app_id="p4_golden_20260725014206",
                title="Smoke",
                app_component="p4_golden_20260725014206",
                category="apps",
                description="smoke",
                enabled=True,
                icon=None,
            )
        )

    store = PostgresDesktopShellStore(db, catalog_dir=catalog_dir)
    ids = {c.app_id for c in store.list_catalog()}
    assert "good_app" in ids
    assert not (LAUNCH_EXCLUDED_APP_IDS & ids)
    assert "p4_golden_20260725014206" not in ids
    boot = store.bootstrap()
    boot_ids = {c.app_id for c in boot.catalog}
    assert "recipe_probe_svc" not in boot_ids
    assert "p4_golden_20260725014206" not in boot_ids
    assert "good_app" in boot_ids


def test_overlay_merge_persists(tmp_path: Path) -> None:
    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    db = _sqlite_db()
    store = PostgresDesktopShellStore(db, catalog_dir=catalog_dir)

    (catalog_dir / "overlay_app.json").write_text(
        '{"app_id":"overlay_app","title":"Overlay","app_component":"overlay_app",'
        '"category":"apps","description":"from disk"}\n',
        encoding="utf-8",
    )

    boot = store.bootstrap()
    assert "overlay_app" in [c.app_id for c in boot.catalog]

    reloaded = PostgresDesktopShellStore(db, catalog_dir=catalog_dir)
    assert "overlay_app" in [c.app_id for c in reloaded.list_catalog()]


def test_in_memory_overlay_reload_unchanged(tmp_path: Path) -> None:
    """Regression: InMemoryDesktopShellStore overlay behavior preserved."""
    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    store = InMemoryDesktopShellStore(catalog_dir)
    assert "late_app" not in [c.app_id for c in store.list_catalog()]

    (catalog_dir / "late_app.json").write_text(
        '{"app_id":"late_app","title":"Late App","app_component":"late_app",'
        '"category":"apps","description":"written after init"}\n',
        encoding="utf-8",
    )

    boot = store.bootstrap()
    assert "late_app" in [c.app_id for c in boot.catalog]
