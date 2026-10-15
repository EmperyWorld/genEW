"""Evolve-without-capsule must not be misdiagnosed as forbid_scratch invent."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

from core.logging import configure_logging

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.reflexes.models import AgentRole
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)


def _tools(tmp_path: Path) -> WorkspaceToolAdapter:
    cfg = ServiceConfig(
        workspace_root=str(tmp_path),
        engine_allow_service_writes=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    return WorkspaceToolAdapter(paths, cfg, configure_logging("t"))


def test_product_evolve_missing_capsule_sets_flag_not_forbid_scratch(
    tmp_path: Path,
) -> None:
    tools = _tools(tmp_path)
    tools.scaffold_service = MagicMock(return_value={"written": []})  # type: ignore[method-assign]
    tools.extract_atoms_for_intention = MagicMock(return_value=[])  # type: ignore[method-assign]
    tools.ensure_product_surfaces = MagicMock(  # type: ignore[method-assign]
        return_value={"written": []}
    )

    written = tools.maybe_scaffold_for_intention(
        intent="evolve astromytant: astronomy dashboard",
        service_name="astromytant",
        role=AgentRole.IMPLEMENTER,
        written_paths=[],
        kind="evolve",
        metadata={"kind": "evolve", "evolve_skip_propose": True},
    )
    assert written == []
    assert tools.last_evolve_missing_capsule == "astromytant"
    tools.scaffold_service.assert_not_called()
    assert (
        tools.forbid_scratch_violation(
            intent="evolve astromytant: astronomy dashboard",
            service_name="astromytant",
            action_stats={"extract_adapt": 0},
        )
        is None
    )


def test_create_as_evolve_missing_capsule_scaffolds(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    tools.scaffold_service = MagicMock(  # type: ignore[method-assign]
        return_value={"written": ["services/new_svc/manifest.json"]}
    )
    tools.extract_atoms_for_intention = MagicMock(  # type: ignore[method-assign]
        return_value=["services/new_svc/src/integration/atoms/a.py"]
    )
    tools.ensure_product_surfaces = MagicMock(  # type: ignore[method-assign]
        return_value={"written": []}
    )
    tools._stamp_atom_file_count = MagicMock()  # type: ignore[method-assign]

    written = tools.maybe_scaffold_for_intention(
        intent="create_service companion chat with dashboard",
        service_name="new_svc",
        role=AgentRole.IMPLEMENTER,
        written_paths=[],
        kind="evolve",
        metadata={},
    )
    assert tools.last_evolve_missing_capsule is None
    tools.scaffold_service.assert_called_once()
    assert "services/new_svc/manifest.json" in written
