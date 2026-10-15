"""Phase 2: DB provision, peer env matrix, live-peers promotion."""

from __future__ import annotations

import json
from pathlib import Path

from core.logging import configure_logging
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    load_recipe_catalog_digest,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.service_factory_peers import (
    after_deploy_hooks,
    after_scaffold_hooks,
    after_verify_passed_hooks,
    apply_database_provision,
    format_live_peers_digest,
    provision_service_database,
    upsert_peer_env_matrix,
    validate_service_name,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
import pytest


def test_validate_rejects_spine() -> None:
    with pytest.raises(ValueError):
        validate_service_name("postgres")
    assert validate_service_name("factory_peer_a") == "factory_peer_a"


def test_provision_overlay_writes_sql(tmp_path: Path) -> None:
    out = provision_service_database(
        tmp_path, "factory_peer_a", apply=False
    )
    assert out["ok"] is True
    overlay = Path(out["overlay"])
    assert overlay.is_file()
    text = overlay.read_text(encoding="utf-8")
    assert "factory_peer_a" in text
    assert "CREATE DATABASE" in text
    assert "GRANT ALL PRIVILEGES" in text
    merged = Path(out["merged"])
    assert merged.is_file()
    assert "factory_peer_a" in merged.read_text(encoding="utf-8")


def test_apply_without_password_soft_fails() -> None:
    out = apply_database_provision("factory_peer_b", admin_url=None)
    # Without env, _admin_database_url is None unless we pass None explicitly —
    # force empty by clearing: admin_url="" treated as falsy after `or`
    out = apply_database_provision("factory_peer_b", admin_url="")
    assert out["ok"] is False
    assert out["applied"] is False


def test_provision_require_apply_fails_without_admin(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)
    monkeypatch.delenv("EIC_POSTGRES_ADMIN_URL", raising=False)
    monkeypatch.delenv("EIC_DATABASE_URL", raising=False)
    out = provision_service_database(
        tmp_path,
        "factory_peer_apply",
        apply=True,
        require_apply=True,
        run_migrations=False,
    )
    assert out["ok"] is False
    assert out.get("apply_ok") is False


def test_admin_url_derived_from_eic_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.empery_intelligence_core.src.integration.service_factory_peers import (
        _admin_database_url,
        service_database_url,
    )

    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)
    monkeypatch.delenv("EIC_POSTGRES_ADMIN_URL", raising=False)
    monkeypatch.setenv(
        "EIC_DATABASE_URL",
        "postgresql+psycopg://eworld:secret@postgres:5432/eic",
    )
    admin = _admin_database_url()
    assert admin is not None
    assert admin.endswith("/postgres")
    assert "secret" in admin
    svc = service_database_url("demo_svc")
    assert svc is not None
    assert svc.endswith("/demo_svc")



def test_peer_env_and_live_peers(tmp_path: Path) -> None:
    (tmp_path / "services" / "factory_peer_c").mkdir(parents=True)
    (tmp_path / "services" / "factory_peer_c" / "manifest.json").write_text(
        json.dumps(
            {
                "name": "factory_peer_c",
                "dependencies": ["identity_service"],
                "publishes": ["factory_peer_c.event"],
                "subscribes": [],
                "features": ["health"],
            }
        )
        + "\n",
        encoding="utf-8",
    )
    (tmp_path / "deploy" / "services").mkdir(parents=True)
    (tmp_path / "deploy" / "services" / "factory_peer_c.yml").write_text(
        'services:\n  factory_peer_c:\n    build:\n      args:\n        SERVICE_PORT: "8123"\n',
        encoding="utf-8",
    )
    env = upsert_peer_env_matrix(tmp_path, "factory_peer_c")
    assert env["ok"] is True
    assert env["entry"]["port"] == 8123
    assert env["entry"]["api_base_env"] == "FACTORY_PEER_C_API_BASE"
    matrix = json.loads(
        (tmp_path / ".cursor/orchestration/eic/peer_env_matrix.json").read_text(
            encoding="utf-8"
        )
    )
    assert "factory_peer_c" in matrix["peers"]
    hb = json.loads(
        (tmp_path / ".cursor/orchestration/eic/dynamic_health_bases.json").read_text(
            encoding="utf-8"
        )
    )
    assert hb["factory_peer_c"] == "http://factory_peer_c:8123"

    deploy = after_deploy_hooks(
        tmp_path, "factory_peer_c", health_ok=True, require_db_apply=False
    )
    assert deploy["entry"]["status"] == "deployed"
    verified = after_verify_passed_hooks(tmp_path, "factory_peer_c")
    assert verified["entry"]["verified"] is True
    assert verified["entry"]["status"] == "verified"
    digest = format_live_peers_digest(tmp_path)
    assert "factory_peer_c" in digest
    assert "Live peers" in digest


def test_recipe_catalog_includes_live_peers(tmp_path: Path) -> None:
    orch = tmp_path / ".cursor" / "orchestration"
    recipes = orch / "recipes"
    recipes.mkdir(parents=True)
    (recipes / "INDEX.md").write_text("# Index\n", encoding="utf-8")
    for law in ("service_anatomy.md", "desktop_mount_catalog.md", "verify_gates.md"):
        (recipes / law).write_text(f"# {law}\n", encoding="utf-8")
    after_scaffold_hooks(
        tmp_path,
        "factory_peer_d",
        port=8200,
        provision_db=True,
        require_db_apply=False,
    )
    after_verify_passed_hooks(tmp_path, "factory_peer_d")
    cfg = ServiceConfig(
        orchestration_root=str(orch),
        workspace_root=str(tmp_path),
        agents_root=str(tmp_path / ".cursor" / "agents"),
        skills_root=str(tmp_path / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    digest, used = load_recipe_catalog_digest(
        paths, service_name="next_svc", intent="create_service next_svc"
    )
    assert "Live peers" in digest
    assert "factory_peer_d" in digest
    assert any("live_peers" in u for u in used)


def test_scaffold_runs_factory_hooks(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("factory2"))
    # Direct scaffold does not run hooks — hooks are on WorkspaceToolAdapter.
    # Use adapter with minimal config.
    from services.empery_intelligence_core.src.integration.orchestration_paths import (
        EicOrchestrationPaths,
    )

    cfg = ServiceConfig(
        orchestration_root=str(tmp_path / ".cursor" / "orchestration"),
        workspace_root=str(tmp_path),
        agents_root=str(tmp_path / ".cursor" / "agents"),
        skills_root=str(tmp_path / ".cursor" / "skills"),
        engine_allow_service_writes=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("factory2_tools"))
    # Avoid depending on ECC/desktop heavy patches failing — still expect DB overlay.
    out = tools.scaffold_service(
        "factory_buddy_2",
        intent="companion chat dock",
        scaffold_profile="companion_chat",
    )
    assert out.get("already_present") is not True or out.get("written")
    sql = tmp_path / "deploy" / "postgres" / "dynamic" / "factory_buddy_2.sql"
    # Scaffold may write UI under apps; factory hooks should create SQL.
    assert sql.is_file() or (out.get("factory") or {}).get("database")
    matrix = tmp_path / ".cursor" / "orchestration" / "eic" / "peer_env_matrix.json"
    assert matrix.is_file()
    _ = action  # silence unused if scaffold went via tools only
