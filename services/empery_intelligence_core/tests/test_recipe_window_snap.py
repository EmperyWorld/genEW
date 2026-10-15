"""window_snap recipe is discoverable for desktop/snap intentions."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    load_recipe_catalog_digest,
)


def test_window_snap_recipe_attached_for_snap_intent() -> None:
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
        service_name="empery_desktop",
        intent="add window snap zones to desktop host",
    )
    assert any(p.endswith("window_snap.md") for p in used), used
    assert "window_snap" in digest
    assert "reference/eliteew/packs/window_snap" in digest
