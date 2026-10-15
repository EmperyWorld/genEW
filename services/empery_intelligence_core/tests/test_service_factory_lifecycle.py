"""Phase 3: enable / disable / delete lifecycle."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.desktop_shell.src.api.main import create_app as create_desktop_app
from services.empery_intelligence_core.src.integration.service_factory_lifecycle import (
    assert_delete_allowed,
    assert_lifecycle_allowed,
    is_user_created_service,
    lifecycle_delete_meta,
    set_service_enabled_files,
    teardown_service_files,
    unpatch_desktop_registry,
)


def test_spine_blocked() -> None:
    with pytest.raises(ValueError):
        assert_lifecycle_allowed("empery_intelligence_core")


def test_disable_enable_catalog_overlay(tmp_path: Path) -> None:
    catalog = (
        tmp_path
        / ".cursor"
        / "orchestration"
        / "eic"
        / "desktop_catalog"
        / "life_svc.json"
    )
    catalog.parent.mkdir(parents=True)
    catalog.write_text(
        json.dumps(
            {
                "app_id": "life_svc",
                "title": "Life",
                "app_component": "life_svc",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    out = set_service_enabled_files(tmp_path, "life_svc", enabled=False)
    assert out["ok"] is True
    assert out["enabled"] is False
    data = json.loads(catalog.read_text(encoding="utf-8"))
    assert data["enabled"] is False
    peers = json.loads(
        (
            tmp_path / ".cursor/orchestration/eic/live_peers.json"
        ).read_text(encoding="utf-8")
    )
    assert peers["peers"]["life_svc"]["status"] == "disabled"

    out2 = set_service_enabled_files(tmp_path, "life_svc", enabled=True)
    assert out2["enabled"] is True
    assert json.loads(catalog.read_text(encoding="utf-8"))["enabled"] is True


def test_teardown_removes_allowlisted_surfaces(tmp_path: Path) -> None:
    name = "life_buddy"
    (tmp_path / "services" / name).mkdir(parents=True)
    (tmp_path / "services" / name / "manifest.json").write_text("{}\n", encoding="utf-8")
    (tmp_path / "deploy" / "services").mkdir(parents=True)
    (tmp_path / "deploy" / "services" / f"{name}.yml").write_text("x\n", encoding="utf-8")
    mounts = tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{name}.tsx").write_text("export {}\n", encoding="utf-8")
    (mounts / "registry.ts").write_text(
        'import type { ComponentType } from "react";\n'
        f'import {{ LifeBuddyMount }} from "./{name}";\n'
        "export const APP_MOUNTS = {\n"
        f"  {name}: LifeBuddyMount,\n"
        "  /* eic:mounts */\n"
        "};\n",
        encoding="utf-8",
    )
    catalog = (
        tmp_path / ".cursor/orchestration/eic/desktop_catalog" / f"{name}.json"
    )
    catalog.parent.mkdir(parents=True)
    catalog.write_text(
        json.dumps(
            {
                "app_id": name,
                "title": "Life Buddy",
                "app_component": name,
                "user_created": True,
            }
        )
        + "\n",
        encoding="utf-8",
    )
    designs = tmp_path / ".cursor/orchestration/designs"
    designs.mkdir(parents=True)
    (designs / f"{name}_design.md").write_text("# d\n", encoding="utf-8")
    (tmp_path / "compose.yml").write_text("services: {}\n", encoding="utf-8")

    out = teardown_service_files(tmp_path, name)
    assert out["ok"] is True
    assert not (tmp_path / "services" / name).exists()
    assert not (tmp_path / "deploy" / "services" / f"{name}.yml").exists()
    assert not (mounts / f"{name}.tsx").exists()
    assert not catalog.exists()
    reg = (mounts / "registry.ts").read_text(encoding="utf-8")
    assert name not in reg
    assert "LifeBuddyMount" not in reg
    assert (designs / "_deleted" / f"{name}_design.md").is_file()


def test_delete_refuses_seed_product_ai_chat(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="seed product"):
        assert_delete_allowed(tmp_path, "ai_chat")


def test_delete_allows_ghost_without_provenance(tmp_path: Path) -> None:
    """Capsule already gone (no design/catalog/manifest) — still deletable cleanup."""
    name = "orphan_svc"
    assert is_user_created_service(tmp_path, name) is False
    assert assert_delete_allowed(tmp_path, name) == name
    meta = lifecycle_delete_meta(tmp_path, name)
    assert meta["deletable"] is True
    assert meta["ghost"] is True
    assert meta["seed_product"] is False


def test_delete_allows_user_created_catalog(tmp_path: Path) -> None:
    name = "my_genesis"
    catalog = (
        tmp_path / ".cursor/orchestration/eic/desktop_catalog" / f"{name}.json"
    )
    catalog.parent.mkdir(parents=True)
    catalog.write_text(
        json.dumps({"app_id": name, "user_created": True}) + "\n",
        encoding="utf-8",
    )
    assert is_user_created_service(tmp_path, name) is True
    assert assert_delete_allowed(tmp_path, name) == name
    meta = lifecycle_delete_meta(tmp_path, name)
    assert meta["deletable"] is True
    assert meta["user_created"] is True


def test_delete_allows_hands_design_without_lifecycle_stamp(tmp_path: Path) -> None:
    """Legacy Hands capsules omit lifecycle.user_created — still deletable."""
    name = "marketing_cabinet"
    designs = tmp_path / ".cursor/orchestration/designs"
    designs.mkdir(parents=True)
    (designs / f"{name}_design.json").write_text(
        json.dumps({"service_name": name, "assembly": {}}) + "\n",
        encoding="utf-8",
    )
    assert is_user_created_service(tmp_path, name) is True
    assert assert_delete_allowed(tmp_path, name) == name
    assert lifecycle_delete_meta(tmp_path, name)["deletable"] is True


def test_delete_allows_manifest_without_feature_stamp(tmp_path: Path) -> None:
    name = "p12_opsdash_retry"
    root = tmp_path / "services" / name
    root.mkdir(parents=True)
    (root / "manifest.json").write_text(
        json.dumps({"name": name, "features": ["health"]}) + "\n",
        encoding="utf-8",
    )
    assert is_user_created_service(tmp_path, name) is True
    assert assert_delete_allowed(tmp_path, name) == name


def test_delete_allows_catalog_without_user_created_flag(tmp_path: Path) -> None:
    name = "maket_service_ai"
    catalog = (
        tmp_path / ".cursor/orchestration/eic/desktop_catalog" / f"{name}.json"
    )
    catalog.parent.mkdir(parents=True)
    catalog.write_text(
        json.dumps({"app_id": name, "title": "Maket"}) + "\n",
        encoding="utf-8",
    )
    assert is_user_created_service(tmp_path, name) is True
    assert assert_delete_allowed(tmp_path, name) == name


def test_ai_chat_not_user_created(tmp_path: Path) -> None:
    assert is_user_created_service(tmp_path, "ai_chat") is False
    meta = lifecycle_delete_meta(tmp_path, "ai_chat")
    assert meta["seed_product"] is True
    assert meta["deletable"] is False


def test_seed_with_design_still_not_user_created(tmp_path: Path) -> None:
    designs = tmp_path / ".cursor/orchestration/designs"
    designs.mkdir(parents=True)
    (designs / "image_studio_design.json").write_text(
        json.dumps({"lifecycle": {"user_created": True}}) + "\n",
        encoding="utf-8",
    )
    assert is_user_created_service(tmp_path, "image_studio") is False
    with pytest.raises(ValueError, match="seed product"):
        assert_delete_allowed(tmp_path, "image_studio")


def test_lab_companion_no_longer_seed_blocked(tmp_path: Path) -> None:
    """p3_* lab goldens must be deletable — not fake seed."""
    name = "p3_comp_live"
    root = tmp_path / "services" / name
    root.mkdir(parents=True)
    (root / "manifest.json").write_text(
        json.dumps({"name": name, "features": ["health"]}) + "\n",
        encoding="utf-8",
    )
    assert is_user_created_service(tmp_path, name) is True
    assert assert_delete_allowed(tmp_path, name) == name
    meta = lifecycle_delete_meta(tmp_path, name)
    assert meta["seed_product"] is False
    assert meta["deletable"] is True


def test_unpatch_only(tmp_path: Path) -> None:
    mounts = tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / "registry.ts").write_text(
        'import { FooBarMount } from "./foo_bar";\n'
        "export const APP_MOUNTS = {\n"
        "  foo_bar: FooBarMount,\n"
        "};\n",
        encoding="utf-8",
    )
    written = unpatch_desktop_registry(tmp_path, "foo_bar")
    assert written
    text = (mounts / "registry.ts").read_text(encoding="utf-8")
    assert "foo_bar" not in text


def test_desktop_shell_catalog_disable_delete(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    db = tmp_path / "desktop_shell.db"
    monkeypatch.setenv(
        "DESKTOP_SHELL_DATABASE_URL",
        f"sqlite+pysqlite:///{db}",
    )
    from services.desktop_shell.config import clear_config_cache

    clear_config_cache()
    with TestClient(create_desktop_app()) as client:
        res = client.post(
            "/api/v1/catalog/apps",
            json={
                "app_id": "temp_app",
                "title": "Temp",
                "app_component": "temp_app",
            },
        )
        assert res.status_code == 200
        assert res.json().get("enabled", True) is True
        patched = client.patch(
            "/api/v1/catalog/apps/temp_app",
            json={"enabled": False},
        )
        assert patched.status_code == 200
        assert patched.json()["enabled"] is False
        boot = client.get("/api/v1/shell-bootstrap").json()
        assert "temp_app" not in boot["installed"]["app_ids"]
        deleted = client.delete("/api/v1/catalog/apps/temp_app")
        assert deleted.status_code == 200
        apps = client.get("/api/v1/catalog/apps").json()
        assert all(a["app_id"] != "temp_app" for a in apps)
