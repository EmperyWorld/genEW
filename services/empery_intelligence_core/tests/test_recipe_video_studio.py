"""video_studio recipe is discoverable for video generation intentions."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    load_recipe_catalog_digest,
)


def test_video_studio_recipe_attached_for_video_intent() -> None:
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
        service_name="video_studio",
        intent="add text to video studio on desktop",
    )
    assert any(p.endswith("video_studio.md") for p in used), used
    assert "video_studio" in digest
    assert "reference/eliteew/packs/video_studio" in digest
