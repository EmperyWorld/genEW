"""ewa_companion recipe is discoverable for companion dock intentions."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    load_recipe_catalog_digest,
)


def test_ewa_companion_recipe_attached_for_companion_intent() -> None:
    root = Path.cwd()
    cfg = ServiceConfig(
        orchestration_root=str(root / ".cursor" / "orchestration"),
        workspace_root=str(root),
        agents_root=str(root / ".cursor" / "agents"),
        skills_root=str(root / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=root)
    digest, used = load_recipe_catalog_digest(
        paths,
        service_name="ewa_companion",
        intent="add ewa companion slim chat dock to desktop",
    )
    assert any(p.endswith("ewa_companion.md") for p in used), used
    assert any(p.endswith("nervas_llm_peer.md") for p in used), used
    assert "ewa_companion" in digest
    assert "reference/eliteew/packs/ewa_companion" in digest


def test_plain_companion_chat_phrase_selects_ewa_companion() -> None:
    """P3 regression: 'companion chat' must not fall through to peer_http-only."""
    from services.empery_intelligence_core.src.integration.recipe_catalog import (
        match_recipe_pack_names,
        resolve_assembly_selection,
    )

    root = Path.cwd()
    cfg = ServiceConfig(
        orchestration_root=str(root / ".cursor" / "orchestration"),
        workspace_root=str(root),
        agents_root=str(root / ".cursor" / "agents"),
        skills_root=str(root / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=root)
    intent = "create_service p3_comp_live companion chat with Nervas messages"
    packs = match_recipe_pack_names(service_name="p3_comp_live", intent=intent)
    assert any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        paths, service_name="p3_comp_live", intent=intent
    )
    assert sel.scaffold_profile == "companion_chat", sel
