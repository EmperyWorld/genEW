"""studios recipe is discoverable for creative/image studio intentions."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    load_recipe_catalog_digest,
)


def test_studios_recipe_attached_for_image_studio_intent() -> None:
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
        service_name="image_studio",
        intent="add creative image studio text-to-image to desktop",
    )
    assert any(p.endswith("studios.md") for p in used), used
    assert "studios" in digest
    assert "reference/eliteew/packs/studios" in digest
