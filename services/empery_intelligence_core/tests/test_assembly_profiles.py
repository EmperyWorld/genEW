"""Assembly profiles + recipe-keyed Hands scaffolds."""

from __future__ import annotations

from pathlib import Path

from core.logging import configure_logging
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.assembly_profiles import (
    resolve_scaffold_profile,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    load_recipe_catalog_digest,
    resolve_assembly_selection,
)
from services.empery_intelligence_core.src.integration.service_scaffold import (
    ServiceScaffoldAction,
)


def test_probe_name_resolves_health_probe() -> None:
    assert (
        resolve_scaffold_profile([], service_name="recipe_probe_svc", intent="create")
        == "health_probe"
    )


def test_companion_beats_shell_host_when_desktop_mentioned() -> None:
    assert (
        resolve_scaffold_profile(
            [
                "desktop_shell_kernel",
                "ewa_companion",
                "nervas_llm_peer",
            ],
            service_name="ai_chat",
            intent="AI Chat companion dock with desktop D1-D3",
        )
        == "companion_chat"
    )


def test_marketing_cabinet_name_does_not_steal_profile() -> None:
    """service_name marketing_* must not force profile=marketing over packs."""
    assert (
        resolve_scaffold_profile(
            ["ops_dashboard", "research_report", "nervas_llm_peer"],
            service_name="marketing_cabinet",
            intent="Добавить JTBD исследования вкладкой и улучшить UI",
        )
        in {"ops_dashboard", "research_report"}
    )
    # Name alone + non-marketing intent → not marketing
    assert (
        resolve_scaffold_profile(
            [],
            service_name="marketing_cabinet",
            intent="harden EventBus redis only",
        )
        != "marketing"
    )


def test_marketing_intent_without_packs_still_resolves_marketing() -> None:
    assert (
        resolve_scaffold_profile(
            [],
            service_name="brand_hub",
            intent="create_service маркетинговый кабинет campaigns",
        )
        == "marketing"
    )


def test_studios_pack_resolves_studio_job() -> None:
    assert (
        resolve_scaffold_profile(
            ["studios", "service_anatomy"],
            service_name="image_lab",
            intent="text-to-image studio",
        )
        == "studio_job"
    )


def test_digest_includes_assembly_contract() -> None:
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
        service_name="music_lab",
        intent="create_service music_forge text-to-music",
    )
    assert "Assembly contract" in digest
    assert "scaffold_profile" in digest
    assert "music_forge" in digest or any(
        "profile=music_forge" in u for u in used
    )
    assert "forbid_generic_crud" in digest


def test_music_forge_resolves_music_forge_profile() -> None:
    assert (
        resolve_scaffold_profile(
            ["music_forge", "studios", "service_anatomy"],
            service_name="music_lab",
            intent="create_service music_forge text-to-music ace-step",
        )
        == "music_forge"
    )


def test_design_assembly_overrides_profile(tmp_path: Path) -> None:
    designs = tmp_path / ".cursor" / "orchestration" / "designs"
    designs.mkdir(parents=True)
    (designs / "x_design.json").write_text(
        '{"service_name":"x","assembly":{"recipe_packs":["ewa_companion"],'
        '"scaffold_profile":"companion_chat","forbid_generic_crud":true}}\n',
        encoding="utf-8",
    )
    recipes = tmp_path / ".cursor" / "orchestration" / "recipes"
    recipes.mkdir(parents=True)
    reports = tmp_path / ".cursor" / "orchestration" / "reports"
    reports.mkdir(parents=True)
    (recipes / "INDEX.md").write_text("# Index\n", encoding="utf-8")
    (recipes / "ewa_companion.md").write_text("# Companion\n", encoding="utf-8")
    (recipes / "pack_golden_registry.yaml").write_text(
        "always_active:\n  - service_factory\nproduct_goldens:\n"
        "  ewa_companion:\n    - companion_golden.md\n",
        encoding="utf-8",
    )
    (reports / "companion_golden.md").write_text(
        "# Companion golden\n\nVerdict: **PASSED**\n",
        encoding="utf-8",
    )
    for law in (
        "service_anatomy.md",
        "desktop_mount_catalog.md",
        "verify_gates.md",
    ):
        (recipes / law).write_text(f"# {law}\n", encoding="utf-8")
    cfg = ServiceConfig(
        orchestration_root=str(tmp_path / ".cursor" / "orchestration"),
        workspace_root=str(tmp_path),
        agents_root=str(tmp_path / ".cursor" / "agents"),
        skills_root=str(tmp_path / ".cursor" / "skills"),
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    from services.empery_intelligence_core.src.integration.pack_golden_law import (
        _load_registry_raw,
    )

    _load_registry_raw.cache_clear()
    sel = resolve_assembly_selection(
        paths, service_name="x", intent="create_service x"
    )
    assert sel.scaffold_profile == "companion_chat"
    assert "ewa_companion" in sel.packs
    _load_registry_raw.cache_clear()


def test_health_probe_scaffold_has_no_domain_item(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("probe_scaffold"))
    out = action.scaffold(
        "assembly_probe_svc",
        features=["health"],
        scaffold_profile="health_probe",
    )
    assert out["scaffold_profile"] == "health_probe"
    models = (
        tmp_path / "services/assembly_probe_svc/src/core/models.py"
    ).read_text(encoding="utf-8")
    assert "class DomainItem" not in models
    assert "ProbeStatus" in models
    routes = (
        tmp_path / "services/assembly_probe_svc/src/api/routes.py"
    ).read_text(encoding="utf-8")
    repo = (
        tmp_path / "services/assembly_probe_svc/src/data/repository.py"
    ).read_text(encoding="utf-8")
    assert "/probe" in routes
    assert "attributes" not in routes
    assert "ProbeStore" in repo
    assert "InMemoryProbeStore" not in repo


def test_studio_job_scaffold(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("studio_scaffold"))
    out = action.scaffold(
        "assembly_studio_svc",
        features=["health"],
        scaffold_profile="studio_job",
        domain_hint="music_forge",
    )
    assert out["scaffold_profile"] == "studio_job"
    models = (
        tmp_path / "services/assembly_studio_svc/src/core/models.py"
    ).read_text(encoding="utf-8")
    assert "GenerationJob" in models
    assert "class DomainItem" not in models


def test_companion_chat_ecc_ui_not_domain_crud(tmp_path: Path) -> None:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    action = ServiceScaffoldAction(tmp_path, configure_logging("companion_ui"))
    action.scaffold(
        "chat_buddy",
        features=["health"],
        scaffold_profile="companion_chat",
        domain_hint="companion chat",
    )
    ui = action.scaffold_ecc_ui(
        "chat_buddy", port=8091, ui_profile="companion_chat", force=True
    )
    assert ui.get("ui_profile") == "companion_chat"
    page = (
        tmp_path
        / "apps/empery_control_center/src/features/chat-buddy/ChatBuddyPage.tsx"
    ).read_text(encoding="utf-8")
    assert "sendMessage" in page
    assert "DomainItem" not in page
    assert "createItem" not in page
    uc = (
        tmp_path
        / "services/empery_control_center_api/src/core/chat_buddy_bff_use_cases.py"
    ).read_text(encoding="utf-8")
    assert "class EccChatBuddyBffUseCases" in uc
    routes = (
        tmp_path
        / "services/empery_control_center_api/src/api/routes_chat_buddy.py"
    ).read_text(encoding="utf-8")
    assert "ecc_chat_buddy_bff_use_cases" in routes
    assert "/messages" in routes
    mount = (
        tmp_path / "apps/empery_desktop/src/shell/mounts/chat_buddy.tsx"
    ).read_text(encoding="utf-8")
    assert "sendMessage" in mount or "listMessages" in mount
    assert "DomainItem" not in mount
