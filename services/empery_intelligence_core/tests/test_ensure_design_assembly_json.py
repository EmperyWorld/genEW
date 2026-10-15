"""Architect must persist assembly packs/profile into design JSON."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from core.logging import configure_logging
from services.empery_intelligence_core.src.integration.assembly_profiles import (
    AssemblySelection,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
from services.empery_intelligence_core.tests.conftest import make_config


def _tools(tmp_path: Path) -> WorkspaceToolAdapter:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    cfg = make_config(tmp_path, engine_allow_service_writes=True)
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    return WorkspaceToolAdapter(paths, cfg, configure_logging("design_asm"))


def test_ensure_design_assembly_json_merges_without_wiping_ui(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    designs = tmp_path / "orchestration" / "designs"
    designs.mkdir(parents=True)
    json_path = designs / "marketing_cabinet_design.json"
    json_path.write_text(
        json.dumps(
            {
                "service_name": "marketing_cabinet",
                "ui": {"required": True, "route": "/ops/marketing-cabinet"},
            }
        ),
        encoding="utf-8",
    )
    fake = AssemblySelection(
        packs=("research_report", "ops_dashboard"),
        scaffold_profile="ops_dashboard",
        extract_roots=("reference/eliteew/frontend/src/features/research",),
        must_read_paths=(),
        forbid_generic_crud=True,
    )
    with patch(
        "services.empery_intelligence_core.src.integration.recipe_catalog.resolve_assembly_selection",
        return_value=fake,
    ):
        out = tools.ensure_design_assembly_json(
            "marketing_cabinet",
            intent="Добавить JTBD вкладку",
        )
    assert out.endswith("marketing_cabinet_design.json")
    data = json.loads(json_path.read_text(encoding="utf-8"))
    assert data["ui"]["route"] == "/ops/marketing-cabinet"
    assert data["assembly"]["recipe_packs"] == ["research_report", "ops_dashboard"]
    assert data["assembly"]["scaffold_profile"] == "ops_dashboard"
    assert data["assembly"]["extract_roots"]


def test_ensure_design_assembly_preserves_existing_packs(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    designs = tmp_path / "orchestration" / "designs"
    designs.mkdir(parents=True)
    json_path = designs / "svc_design.json"
    json_path.write_text(
        json.dumps(
            {
                "service_name": "svc",
                "assembly": {
                    "recipe_packs": ["task_board"],
                    "scaffold_profile": "task_board",
                    "extract_roots": ["a"],
                },
            }
        ),
        encoding="utf-8",
    )
    fake = AssemblySelection(
        packs=("ops_dashboard",),
        scaffold_profile="ops_dashboard",
        extract_roots=("b",),
        must_read_paths=(),
        forbid_generic_crud=True,
    )
    with patch(
        "services.empery_intelligence_core.src.integration.recipe_catalog.resolve_assembly_selection",
        return_value=fake,
    ):
        tools.ensure_design_assembly_json("svc", intent="x")
    data = json.loads(json_path.read_text(encoding="utf-8"))
    # Existing packs win (Hands must not lose operator/design packs).
    assert data["assembly"]["recipe_packs"] == ["task_board"]
    assert data["assembly"]["scaffold_profile"] == "task_board"
