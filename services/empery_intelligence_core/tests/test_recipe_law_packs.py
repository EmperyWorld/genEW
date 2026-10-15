"""Law + peer recipes attach for create-service and peer intents."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    load_recipe_catalog_digest,
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


def test_create_service_gets_law_packs() -> None:
    digest, used = load_recipe_catalog_digest(
        _paths(),
        service_name="notes_lite",
        intent="create-service scaffold a new notes module",
    )
    for name in (
        "service_anatomy.md",
        "desktop_mount_catalog.md",
        "verify_gates.md",
        "service_factory.md",
    ):
        assert any(p.endswith(name) for p in used), (name, used)
    assert "service_anatomy" in digest
    assert "verify_gates" in digest
    assert "service_factory" in digest
    assert "D1" in digest or "Desktop D1" in digest


def test_comfy_intent_gets_peer_and_studios() -> None:
    digest, used = load_recipe_catalog_digest(
        _paths(),
        service_name="image_studio",
        intent="wire comfyui image peer for text to image",
    )
    assert any(p.endswith("comfy_image_peer.md") for p in used), used
    assert any(p.endswith("studios.md") for p in used), used
    assert "192.168.1.136:31003" in digest
    assert "FakeAI" in digest


def test_llm_intent_gets_nervas_peer() -> None:
    digest, used = load_recipe_catalog_digest(
        _paths(),
        service_name="empery_intelligence_core",
        intent="point nervas at living brain llama gemma",
    )
    assert any(p.endswith("nervas_llm_peer.md") for p in used), used
    assert "192.168.1.111:8080" in digest
    assert "FakeNervas" in digest or "FakeAI" in digest
