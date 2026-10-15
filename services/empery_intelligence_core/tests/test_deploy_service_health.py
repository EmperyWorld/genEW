"""deploy_service fail-closed when compose up succeeds but health fails."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from core.logging import configure_logging
from services.empery_intelligence_core.src.integration.orchestration_paths import (
    EicOrchestrationPaths,
)
from services.empery_intelligence_core.src.integration.workspace_tools import (
    WorkspaceToolAdapter,
)
from services.empery_intelligence_core.tests.conftest import make_config


def _tools(tmp_path: Path) -> WorkspaceToolAdapter:
    (tmp_path / ".cursor" / "orchestration" / "eic").mkdir(parents=True)
    cfg = make_config(
        tmp_path,
        deploy_agent_url="http://deploy:8010",
        require_deploy_agent=True,
    )
    paths = EicOrchestrationPaths.from_config(cfg, cwd=tmp_path)
    return WorkspaceToolAdapter(paths, cfg, configure_logging("deploy_health"))


def test_deploy_service_fail_closed_on_health_failure(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    mock_client = MagicMock()
    mock_client.configured = True
    mock_client.deploy.side_effect = [
        {"ok": True, "action": "up", "service_name": "probe_svc"},
        {
            "ok": False,
            "action": "health",
            "service_name": "probe_svc",
            "error": "timed out after 12 attempts",
            "details": {"url": "http://probe_svc:8000/api/v1/health", "attempts": 12},
        },
    ]

    with patch(
        "services.empery_intelligence_core.src.integration.deploy_agent_client.DeployAgentClient",
        return_value=mock_client,
    ):
        result = tools.deploy_service("probe_svc")

    assert result["ok"] is False
    assert "health failed" in (result.get("error") or "").lower()
    assert result["health"]["ok"] is False
    assert mock_client.deploy.call_count == 2


def test_deploy_service_ok_when_health_passes(tmp_path: Path) -> None:
    tools = _tools(tmp_path)
    mock_client = MagicMock()
    mock_client.configured = True
    mock_client.deploy.side_effect = [
        {"ok": True, "action": "up", "service_name": "probe_svc"},
        {
            "ok": True,
            "action": "health",
            "service_name": "probe_svc",
            "details": {"url": "http://probe_svc:8000/api/v1/health", "attempts": 2},
        },
    ]

    with (
        patch(
            "services.empery_intelligence_core.src.integration.deploy_agent_client.DeployAgentClient",
            return_value=mock_client,
        ),
        patch.object(tools, "_refresh_ecc_registry"),
        patch(
            "services.empery_intelligence_core.src.integration.service_factory_peers.after_deploy_hooks",
            return_value={"promoted": True},
        ),
    ):
        result = tools.deploy_service("probe_svc")

    assert result["ok"] is True
    assert result["health"]["ok"] is True
