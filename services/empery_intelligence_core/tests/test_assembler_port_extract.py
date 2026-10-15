"""AssemblerPort.extract_adapt — local adapter + WorkspaceToolAdapter routing."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.integration.local_assembler_adapter import (
    LocalAssemblerAdapter,
)
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)


def _seed_genesis_pack(ws: Path, pack: str = "port_pack") -> None:
    src = ws / "reference" / "eliteew" / "packs" / pack
    src.mkdir(parents=True)
    (src / "widget.tsx").write_text("export const W = 1;\n", encoding="utf-8")


def _tools(tmp_path: Path, *, assembler: Any | None = None) -> WorkspaceToolAdapter:
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
    return WorkspaceToolAdapter(
        paths,
        cfg,
        logging.getLogger("test.port_extract"),
        assembler=assembler,
    )


def test_local_assembler_extract_adapt(tmp_path: Path) -> None:
    _seed_genesis_pack(tmp_path)
    adapter = LocalAssemblerAdapter()
    result = adapter.extract_adapt(
        tmp_path,
        source_glob="reference/eliteew/packs/port_pack/*.tsx",
        dest="services/port_svc/src/integration/atoms/",
        service_name="port_svc",
        mode="genesis",
    )
    assert result["ok"] is True, result.get("error")
    assert result["transport"] == "local"
    assert result["written"]
    assert any((tmp_path / p).is_file() for p in result["written"])


def test_workspace_tools_routes_extract_via_assembler_port(tmp_path: Path) -> None:
    _seed_genesis_pack(tmp_path, pack="wt_pack")

    class SpyAssembler:
        def __init__(self) -> None:
            self.calls: list[dict[str, Any]] = []

        def extract_adapt(self, workspace: Path, **kwargs: Any) -> dict[str, Any]:
            self.calls.append({"workspace": workspace, **kwargs})
            dest = kwargs["dest"].rstrip("/")
            out = workspace / dest / "widget.tsx"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text("export const W = 1;\n", encoding="utf-8")
            return {
                "ok": True,
                "error": None,
                "written": [f"{dest}/widget.tsx"],
                "skipped": [],
                "mode": kwargs.get("mode") or "genesis",
                "transport": "spy",
            }

    spy = SpyAssembler()
    tools = _tools(tmp_path, assembler=spy)
    result = tools.extract_adapt_action(
        {
            "source_glob": "reference/eliteew/packs/wt_pack/*.tsx",
            "dest": "services/wt_svc/src/integration/atoms/",
            "mode": "genesis",
        },
        service_name="wt_svc",
    )
    assert result["ok"] is True
    assert result["transport"] == "spy"
    assert spy.calls
    assert spy.calls[0]["service_name"] == "wt_svc"
    assert tools.last_action_stats["extract_adapt"] == 1
