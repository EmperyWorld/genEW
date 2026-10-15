"""P5.2: scaffold returns recipe_packs + profile for Autonomous job metadata."""

from __future__ import annotations

from pathlib import Path

from core.logging import configure_logging
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
from services.empery_intelligence_core.tests.conftest import make_config


def test_scaffold_service_returns_assembly_meta(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    # Minimal recipe catalog so companion matches.
    recipes = tmp_path / ".cursor" / "orchestration" / "recipes"
    recipes.mkdir(parents=True, exist_ok=True)
    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("p5_asm"))
    result = tools.scaffold_service(
        "p5_asm_buddy",
        intent="Create companion chat service with Nervas",
        features=["health", "companion_chat"],
        scaffold_profile="companion_chat",
    )
    assert result.get("scaffold_profile") == "companion_chat"
    assert isinstance(result.get("recipe_packs"), list)
    assert tools.last_scaffold_meta.get("scaffold_profile") == "companion_chat"


def test_count_service_atom_files_and_stamp(tmp_path: Path) -> None:
    from core.logging import configure_logging
    from services.empery_intelligence_core.src.integration.orchestration_paths import (
        EicOrchestrationPaths,
    )
    from services.empery_intelligence_core.src.integration.workspace_tools import (
        WorkspaceToolAdapter,
    )
    from services.empery_intelligence_core.tests.conftest import make_config

    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    tools = WorkspaceToolAdapter(paths, cfg, configure_logging("atom_count"))
    svc = "p13_atom_count"
    atoms = tmp_path / "services" / svc / "src" / "integration" / "atoms"
    atoms.mkdir(parents=True)
    (atoms / "a.py").write_text("x=1\n", encoding="utf-8")
    desk = tmp_path / "apps" / "empery_desktop" / "atoms" / svc
    desk.mkdir(parents=True)
    (desk / "b.ts").write_text("export {}\n", encoding="utf-8")
    tools.last_scaffold_meta = {"scaffold_profile": "music_forge", "recipe_packs": ["music_forge"]}
    n = tools._stamp_atom_file_count(svc)
    assert n == 2
    assert tools.last_scaffold_meta["eic_atom_file_count"] == 2
