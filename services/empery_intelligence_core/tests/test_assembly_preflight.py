"""Assembler preflight Gate T∧C before ECC reload / deploy path."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from core.integration.assembly_contracts import (
    default_ops_dashboard_blueprint,
    manifest_from_blueprint,
)
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.reflexes.models import AgentRole
from services.empery_intelligence_core.src.integration.local_assembler_adapter import (
    LocalAssemblerAdapter,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.service_scaffold_desktop import (
    _ops_dashboard_mount_tsx,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)


def _tools(tmp_path: Path) -> WorkspaceToolAdapter:
    cfg = ServiceConfig(
        workspace_root=str(tmp_path),
        orchestration_root=str(tmp_path / ".cursor" / "orchestration"),
        deploy_agent_url="",
        auto_deploy_on_implement=False,
        engine_allow_service_writes=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    paths.designs_root.mkdir(parents=True, exist_ok=True)
    paths.eic_root.mkdir(parents=True, exist_ok=True)
    (paths.eic_root / "assembly").mkdir(parents=True, exist_ok=True)
    return WorkspaceToolAdapter(
        paths,
        cfg,
        logging.getLogger("test.preflight"),
        assembler=LocalAssemblerAdapter(),
    )


def _seed(tmp_path: Path, service: str, tools: WorkspaceToolAdapter) -> None:
    mounts = tmp_path / "apps" / "empery_desktop" / "src" / "shell" / "mounts"
    mounts.mkdir(parents=True)
    (mounts / f"{service}.tsx").write_text(
        _ops_dashboard_mount_tsx(service, "Preflight", "Preflight", 8099),
        encoding="utf-8",
    )
    bp = default_ops_dashboard_blueprint(service_name=service)
    mf = manifest_from_blueprint(bp)
    (tools._paths.designs_root / f"{service}_blueprint.json").write_text(
        json.dumps(bp.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )
    (tools._paths.eic_root / "assembly" / f"{service}_manifest.json").write_text(
        json.dumps(mf.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8"
    )


def test_preflight_passes_after_clean_assemble(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("EIC_ASSEMBLY_SKIP_TSC", "1")
    monkeypatch.delenv("EIC_ASSEMBLY_SKIP_PREFLIGHT", raising=False)
    service = "preflight_ok"
    tools = _tools(tmp_path)
    _seed(tmp_path, service, tools)
    tools.maybe_scaffold_for_intention = lambda **_k: []  # type: ignore[method-assign]
    written = tools.run_config_driven_assembler(
        service,
        intent="ops dashboard metrics",
        role=AgentRole.IMPLEMENTER,
        written_paths=[],
        scaffold_profile="ops_dashboard",
        skip_mechanical_extract=True,
    )
    assert any("assembly_runtime.json" in p for p in written)
    pre = (tools.last_assembly_meta or {}).get("preflight") or {}
    assert pre.get("skipped") is False
    assert pre.get("gate_t") == "PASSED"
    assert pre.get("gate_c") == "PASSED"


def test_preflight_skip_env(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("EIC_ASSEMBLY_SKIP_TSC", "1")
    monkeypatch.setenv("EIC_ASSEMBLY_SKIP_PREFLIGHT", "1")
    service = "preflight_skip"
    tools = _tools(tmp_path)
    _seed(tmp_path, service, tools)
    tools.maybe_scaffold_for_intention = lambda **_k: []  # type: ignore[method-assign]
    tools.run_config_driven_assembler(
        service,
        intent="ops",
        role=AgentRole.IMPLEMENTER,
        written_paths=[],
        scaffold_profile="ops_dashboard",
        skip_mechanical_extract=True,
    )
    pre = (tools.last_assembly_meta or {}).get("preflight") or {}
    assert pre.get("skipped") is True
