"""Recipe diversity matchers — non-chat intents must not fall through to companion."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
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


def test_chat_intent_selects_companion() -> None:
    packs = match_recipe_pack_names(
        service_name="p3_comp_live",
        intent="create_service companion chat with Nervas messages",
    )
    assert any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(),
        service_name="p3_comp_live",
        intent="create_service companion chat with Nervas messages",
    )
    assert sel.scaffold_profile == "companion_chat"


def test_notes_intent_selects_doc_editor_not_companion() -> None:
    intent = "create_service notes_lite блокнот longread editor"
    packs = match_recipe_pack_names(service_name="notes_lite", intent=intent)
    assert any(p.endswith("doc_editor.md") for p in packs), packs
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="notes_lite", intent=intent
    )
    assert sel.scaffold_profile == "editor_local"


def test_dashboard_assembly_selection_ops_profile() -> None:
    intent = "create_service ops_metrics llm dashboard метрики jtbd board"
    packs = match_recipe_pack_names(service_name="ops_metrics", intent=intent)
    assert any(p.endswith("ops_dashboard.md") for p in packs), packs
    assert any(p.endswith("nervas_llm_peer.md") for p in packs), packs
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="ops_metrics", intent=intent
    )
    assert sel.scaffold_profile == "ops_dashboard"
    assert any("ops_dashboard" in r for r in sel.extract_roots), sel.extract_roots


def test_bare_ai_dashboard_not_companion() -> None:
    packs = match_recipe_pack_names(
        service_name="ai_dashboard",
        intent="create_service ai dashboard for metrics",
    )
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs


def test_image_studio_selects_studios_not_companion() -> None:
    intent = "create_service image_lab text-to-image studio"
    packs = match_recipe_pack_names(service_name="image_lab", intent=intent)
    assert any(p.endswith("studios.md") for p in packs), packs
    assert any(p.endswith("comfy_image_peer.md") for p in packs), packs
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="image_lab", intent=intent
    )
    assert sel.scaffold_profile == "image_studio"


def test_video_studio_selects_video_not_companion() -> None:
    intent = "create_service video_lab image-to-video wan i2v studio"
    packs = match_recipe_pack_names(service_name="video_lab", intent=intent)
    assert any(p.endswith("video_studio.md") for p in packs), packs
    assert any(p.endswith("studios.md") for p in packs), packs
    assert not any(p.endswith("comfy_image_peer.md") for p in packs), packs
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="video_lab", intent=intent
    )
    assert sel.scaffold_profile == "video_studio"


def test_video_comfy_not_image_studio() -> None:
    """Video + comfy keywords must resolve to video_studio, not image_studio."""
    intent = "create_service wan2.2 comfy image-to-video studio"
    packs = match_recipe_pack_names(service_name="wan_i2v", intent=intent)
    assert any(p.endswith("video_studio.md") for p in packs), packs
    assert not any(p.endswith("comfy_image_peer.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="wan_i2v", intent=intent
    )
    assert sel.scaffold_profile == "video_studio"
    assert sel.scaffold_profile != "image_studio"


def test_research_report_prefers_research_profile_not_companion() -> None:
    intent = "create_service market_research маркетинг отчёт nervas summary"
    packs = match_recipe_pack_names(service_name="market_research", intent=intent)
    assert any(p.endswith("research_report.md") for p in packs), packs
    assert any(p.endswith("nervas_llm_peer.md") for p in packs), packs
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="market_research", intent=intent
    )
    assert sel.scaffold_profile == "research_report"


def test_research_report_negation_phrase_does_not_steal_companion() -> None:
    """Operator prose 'not companion chat' must not select ewa_companion."""
    intent = (
        "create_service market_research маркетинг отчёт nervas summary "
        "— use research_report recipe pack (not companion chat, not generic CRUD)"
    )
    packs = match_recipe_pack_names(service_name="market_research", intent=intent)
    assert any(p.endswith("research_report.md") for p in packs), packs
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="market_research", intent=intent
    )
    assert sel.scaffold_profile == "research_report"


def test_music_forge_selects_music_forge_not_studio_job() -> None:
    intent = "create_service music_lab text-to-music ace-step music forge"
    packs = match_recipe_pack_names(service_name="music_lab", intent=intent)
    assert any(p.endswith("music_forge.md") for p in packs), packs
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="music_lab", intent=intent
    )
    assert sel.scaffold_profile == "music_forge"
    assert sel.scaffold_profile != "studio_job"


def test_site_studio_prefers_site_studio_not_studio_job() -> None:
    intent = "create_service site_lab user site studio preview builder nervas HTML"
    packs = match_recipe_pack_names(service_name="site_lab", intent=intent)
    assert any(p.endswith("site_studio.md") for p in packs), packs
    assert not any(p.endswith("studios.md") for p in packs), packs
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="site_lab", intent=intent
    )
    assert sel.scaffold_profile == "site_studio"
    assert any("site_studio" in r for r in sel.extract_roots), sel.extract_roots


def test_presentation_prefers_ewrp_not_ops_dashboard() -> None:
    intent = (
        "create_service presentationsai AI презентаций чат стилистика "
        "дашборд истории презентаций"
    )
    packs = match_recipe_pack_names(service_name="presentationsai", intent=intent)
    assert any(p.endswith("ewrp.md") for p in packs), packs
    assert not any(p.endswith("ops_dashboard.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="presentationsai", intent=intent
    )
    assert sel.scaffold_profile == "presentation_ai"
    assert any("ewrp" in r for r in sel.extract_roots), sel.extract_roots


def test_kanban_selects_task_board_not_health_probe() -> None:
    intent = "create_service sprint_board kanban задач board"
    packs = match_recipe_pack_names(service_name="sprint_board", intent=intent)
    assert any(p.endswith("task_board.md") for p in packs), packs
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs
    sel = resolve_assembly_selection(
        _paths(), service_name="sprint_board", intent=intent
    )
    assert sel.scaffold_profile == "task_board"
    assert any("task_board" in r for r in sel.extract_roots), sel.extract_roots


def test_notes_extract_includes_notes_crud() -> None:
    intent = "create_service notes_lite блокнот longread editor"
    sel = resolve_assembly_selection(
        _paths(), service_name="notes_lite", intent=intent
    )
    assert sel.scaffold_profile == "editor_local"
    assert any("notes_crud" in r or "doc_editor" in r for r in sel.extract_roots), (
        sel.extract_roots
    )


def test_directory_crud_not_companion() -> None:
    intent = "create_service parts_dir справочник crud list"
    packs = match_recipe_pack_names(service_name="parts_dir", intent=intent)
    assert any(p.endswith("service_factory.md") for p in packs), packs
    assert not any(p.endswith("ewa_companion.md") for p in packs), packs
