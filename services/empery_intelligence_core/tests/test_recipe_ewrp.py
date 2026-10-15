"""ewrp / presentation_ai recipe is discoverable for presentation intentions."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    load_recipe_catalog_digest,
    match_recipe_pack_names,
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


def test_ewrp_recipe_attached_for_presentation_intent() -> None:
    intent = (
        "create_service presentationsai приложение для создания AI презентаций "
        "чат про стилистику и дашборд истории презентаций"
    )
    used = match_recipe_pack_names(service_name="presentationsai", intent=intent)
    assert any(p.endswith("ewrp.md") for p in used), used
    assert not any(p.endswith("ops_dashboard.md") for p in used), used
    digest, digest_used = load_recipe_catalog_digest(
        _paths(),
        service_name="presentationsai",
        intent=intent,
    )
    assert any(p.endswith("ewrp.md") for p in digest_used), digest_used
    assert "ewrp" in digest
    assert "reference/eliteew/packs/ewrp" in digest


def test_ewrp_prefers_presentation_ai_not_ops_dashboard() -> None:
    intent = (
        "create_service deck_lab AI presentation slide deck with history dashboard"
    )
    packs = match_recipe_pack_names(service_name="deck_lab", intent=intent)
    assert any(p.endswith("ewrp.md") for p in packs), packs
    assert not any(p.endswith("ops_dashboard.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="deck_lab", intent=intent
    )
    assert sel.scaffold_profile == "presentation_ai"
    assert any("ewrp" in r for r in sel.extract_roots), sel.extract_roots
