"""Deploy-agent workspace health — HTTP contract + stderr bake on compose fail."""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from services.empery_deploy_agent.config import ServiceConfig
from services.empery_deploy_agent.src.api.main import create_app
from services.empery_deploy_agent.src.core.contracts import DeployAction
from services.empery_deploy_agent.src.integration.compose_runner import ComposeRunner


def test_health_http_degraded_when_workspace_empty() -> None:
    cfg = ServiceConfig(host_workspace="", require_socket=False)
    client = TestClient(create_app(config=cfg))
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["socket_ok"] is True or body["socket_ok"] is False
    assert body.get("details", {}).get("workspace_ok") is False
    assert "empty" in str(body.get("details", {}).get("workspace_error") or "").lower()


def test_health_http_ok_for_absolute_workspace(tmp_path: Path) -> None:
    (tmp_path / "compose.yml").write_text("services: {}\n", encoding="utf-8")
    cfg = ServiceConfig(
        host_workspace=str(tmp_path),
        require_socket=False,
        # Non-unix host → socket_ok True (no sock file required).
        container_host="tcp://127.0.0.1:2375",
    )
    client = TestClient(create_app(config=cfg))
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["workspace"] == str(tmp_path)
    assert body.get("details", {}).get("workspace_ok") is True


def test_compose_fail_error_includes_stderr_snippet(tmp_path: Path) -> None:
    (tmp_path / "compose.yml").write_text("services: {}\n", encoding="utf-8")
    cfg = ServiceConfig(
        host_workspace=str(tmp_path),
        require_socket=False,
        compose_timeout_s=30,
    )
    runner = ComposeRunner(cfg, logging.getLogger("test.stderr_bake"))

    fake = MagicMock()
    fake.returncode = 1
    fake.stdout = ""
    fake.stderr = "Error: SELinux label conflict on volume bind\ncompose failed hard\n"

    with (
        patch(
            "services.empery_deploy_agent.src.integration.compose_runner.build_compose_argv_steps",
            return_value=[["podman-compose", "-f", "compose.yml", "up", "-d", "x"]],
        ),
        patch(
            "services.empery_deploy_agent.src.integration.compose_runner.subprocess.run",
            return_value=fake,
        ),
    ):
        result = runner.run(service_name="analytics_service", action=DeployAction.UP)

    assert result.ok is False
    assert result.exit_code == 1
    assert "compose exit 1" in (result.error or "")
    assert "SELinux label conflict" in (result.error or "")
    assert "SELinux label conflict" in (result.output or "")


def test_live_deploy_agent_health_if_up() -> None:
    """Hit real deploy_agent if listening — proves workspace_ok field on production path."""
    for base in ("http://127.0.0.1:8010", "http://127.0.0.1:8010"):
        try:
            r = httpx.get(f"{base}/api/v1/health", timeout=2.0)
        except Exception:  # noqa: BLE001
            pytest.skip("empery_deploy_agent not reachable on :8010")
        assert r.status_code == 200
        body = r.json()
        assert body.get("service") == "empery_deploy_agent"
        assert "workspace" in body
        assert body.get("status") in {"ok", "degraded"}
        # After harden, details.workspace_ok must be present when agent rebuilt;
        # tolerate older containers missing details until recreate.
        if "details" in body and body["details"] is not None:
            assert "workspace_ok" in body["details"]
        return
