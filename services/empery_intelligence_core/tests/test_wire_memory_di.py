"""DI wiring tests for EIC memory slice."""

from __future__ import annotations

from pathlib import Path

from core.container import ServiceContainer
from core.registry import database_manager_key
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.api.wire_memory import (
    bootstrap_memory,
    wire_memory,
)


def test_wire_memory_registers_namespaced_database_manager(tmp_path: Path) -> None:
    cfg = ServiceConfig(
        database_url=f"sqlite+pysqlite:///{tmp_path / 'memory.db'}",
        auto_create_tables=True,
        orchestration_root=str(tmp_path / "orchestration"),
        workspace_root=str(tmp_path),
    )
    container = ServiceContainer()
    wire_memory(container, cfg)

    db_key = database_manager_key(cfg.service_name)
    assert container.has(db_key)
    assert not container.has("database_manager")

    db = container.resolve(db_key)
    assert db.database_url == cfg.database_url


def test_wire_memory_resolves_namespaced_db_for_repositories(tmp_path: Path) -> None:
    cfg = ServiceConfig(
        database_url=f"sqlite+pysqlite:///{tmp_path / 'memory.db'}",
        auto_create_tables=True,
        orchestration_root=str(tmp_path / "orchestration"),
        workspace_root=str(tmp_path),
    )
    container = ServiceContainer()
    wire_memory(container, cfg)
    bootstrap_memory(container, cfg)

    repo = container.resolve("eic_atom_repository")
    store = container.resolve("eic_doc_proposal_store")
    db_key = database_manager_key(cfg.service_name)
    assert repo._db is container.resolve(db_key)
    assert store._db is container.resolve(db_key)
