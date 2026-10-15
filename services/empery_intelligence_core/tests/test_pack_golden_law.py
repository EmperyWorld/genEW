"""P18 pack golden law — product packs need PASSED evidence."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.pack_golden_law import (
    filter_active_pack_stems,
    inactive_product_packs,
    is_pack_assembly_active,
    pack_has_passed_golden,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    resolve_assembly_selection,
)


def _paths() -> EicOrchestrationPaths:
    root = Path.cwd()
    cfg = ServiceConfig(
        orchestration_root=str(root / ".cursor" / "orchestration"),
        workspace_root=str(root),
        agents_root=str(root / ".cursor" / "agents"),
        skills_root=str(root / ".cursor" / "skills"),
    )
    return EicOrchestrationPaths.from_config(cfg, cwd=root)


def test_product_packs_have_passed_goldens() -> None:
    paths = _paths()
    assert inactive_product_packs(paths) == []


def test_task_board_active_via_golden() -> None:
    paths = _paths()
    assert pack_has_passed_golden(paths, "task_board")
    assert is_pack_assembly_active(paths, "task_board")


def test_law_packs_always_active() -> None:
    paths = _paths()
    assert is_pack_assembly_active(paths, "service_factory")
    assert is_pack_assembly_active(paths, "verify_gates")


def test_filter_drops_inactive_product(tmp_path: Path, monkeypatch) -> None:
    """Synthetic registry: unknown product stem filtered out."""
    from services.empery_intelligence_core.src.integration import pack_golden_law as law

    orch = tmp_path / ".cursor" / "orchestration"
    recipes = orch / "recipes"
    reports = orch / "reports"
    recipes.mkdir(parents=True)
    reports.mkdir(parents=True)
    (recipes / "pack_golden_registry.yaml").write_text(
        "always_active:\n  - service_factory\nproduct_goldens:\n  task_board:\n    - missing.md\n",
        encoding="utf-8",
    )
    cfg = ServiceConfig(
        orchestration_root=str(orch),
        workspace_root=str(tmp_path),
        agents_root=str(tmp_path / ".cursor" / "agents"),
        skills_root=str(tmp_path / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    law._load_registry_raw.cache_clear()
    assert not is_pack_assembly_active(paths, "task_board")
    assert filter_active_pack_stems(paths, ["service_factory", "task_board"]) == [
        "service_factory"
    ]
    law._load_registry_raw.cache_clear()


def test_resolve_assembly_keeps_proven_companion() -> None:
    paths = _paths()
    sel = resolve_assembly_selection(
        paths,
        service_name="ai_chat",
        intent="Create companion chat with Nervas on Desktop",
    )
    assert "ewa_companion" in sel.packs
    assert sel.scaffold_profile == "companion_chat"
