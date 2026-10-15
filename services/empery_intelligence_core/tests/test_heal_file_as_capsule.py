"""LLM write_file(services/{name}) must not pause-loop Resume with ENOTDIR."""

from __future__ import annotations

from pathlib import Path

from core.logging import configure_logging
from services.empery_intelligence_core.src.core.reflexes.models import AgentRole
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
from services.empery_intelligence_core.tests.conftest import make_config


def test_scaffold_heals_file_as_capsule_root(tmp_path: Path) -> None:
    (tmp_path / "services").mkdir(parents=True)
    bogus = tmp_path / "services" / "file_capsule"
    bogus.write_text("", encoding="utf-8")
    assert bogus.is_file()

    scaffold = ServiceScaffoldAction(tmp_path, configure_logging("heal_scaffold"))
    assert scaffold.heal_corrupt_service_root("file_capsule") is True
    assert not bogus.exists()

    bogus.write_text("", encoding="utf-8")
    out = scaffold.scaffold("file_capsule", features=["health"])
    assert (tmp_path / "services/file_capsule/src/api/main.py").is_file()
    assert (tmp_path / "services/file_capsule").is_dir()
    assert out.get("written")


def test_write_text_heals_file_ancestor(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "services").mkdir(parents=True)
    (tmp_path / "services" / "blocked").write_text("", encoding="utf-8")

    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("heal_write"))
    target = tmp_path / "services/blocked/src/api/main.py"
    tools.write_text(target, "# ok\n")
    assert target.is_file()
    assert (tmp_path / "services/blocked").is_dir()


def test_write_file_capsule_root_becomes_dir(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "services").mkdir(parents=True)
    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("heal_apply"))
    written = tools.apply_actions(
        [{"op": "write_file", "path": "services/rootonly", "content": ""}],
        role=AgentRole.IMPLEMENTER,
        service_name="rootonly",
    )
    assert written
    assert (tmp_path / "services/rootonly").is_dir()
    assert not (tmp_path / "services/rootonly").is_file()


def test_corrupt_root_evolve_becomes_genesis(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    (tmp_path / "services").mkdir(parents=True)
    (tmp_path / "services" / "presentationai").write_text("", encoding="utf-8")
    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("heal_evolve"))

    written = tools.maybe_scaffold_for_intention(
        intent="evolve presentationai: add AI presentation dashboard",
        service_name="presentationai",
        role=AgentRole.IMPLEMENTER,
        written_paths=[],
        kind="evolve",
        skip_mechanical_extract=True,
    )
    assert tools.last_evolve_missing_capsule is None
    assert (tmp_path / "services/presentationai/manifest.json").is_file()
    assert any("presentationai" in p for p in written)
