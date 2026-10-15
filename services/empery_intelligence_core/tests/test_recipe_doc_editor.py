"""doc_editor recipe is discoverable for editor/tiptap intentions."""

from __future__ import annotations

from pathlib import Path

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.recipe_catalog import (
    load_recipe_catalog_digest,
)


def test_doc_editor_recipe_attached_for_editor_intent() -> None:
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
        service_name="doc_editor",
        intent="add tiptap document editor to desktop",
    )
    assert any(p.endswith("doc_editor.md") for p in used), used
    assert "doc_editor" in digest
    assert "reference/eliteew/packs/doc_editor" in digest
