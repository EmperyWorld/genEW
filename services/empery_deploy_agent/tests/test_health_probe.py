"""Unit tests for deploy-agent health probe retry/backoff."""

from __future__ import annotations

import logging
from pathlib import Path
from unittest.mock import MagicMock, patch

import urllib.error

from services.empery_deploy_agent.config import ServiceConfig
from services.empery_deploy_agent.src.integration.compose_runner import ComposeRunner


def _runner(tmp_path: Path, *, retries: int = 3, backoff: float = 0.01) -> ComposeRunner:
    (tmp_path / "compose.yml").write_text("services: {}\n", encoding="utf-8")
    cfg = ServiceConfig(
        host_workspace=str(tmp_path),
        require_socket=False,
        health_probe_retries=retries,
        health_probe_backoff_s=backoff,
        health_probe_timeout_s=1.0,
    )
    return ComposeRunner(cfg, logging.getLogger("test_health_probe"))


def test_health_succeeds_after_transient_failures(tmp_path: Path) -> None:
    runner = _runner(tmp_path, retries=4)
    url = "http://foo_service:8000/api/v1/health"
    calls = {"n": 0}

    def _urlopen(_url: str, timeout: float = 1.0) -> MagicMock:
        calls["n"] += 1
        if calls["n"] < 3:
            raise urllib.error.URLError("connection refused")
        resp = MagicMock()
        resp.__enter__ = MagicMock(return_value=resp)
        resp.__exit__ = MagicMock(return_value=False)
        resp.read.return_value = b'{"status":"ok"}'
        resp.status = 200
        return resp

    with (
        patch(
            "services.empery_deploy_agent.src.integration.compose_runner.urllib.request.urlopen",
            side_effect=_urlopen,
        ),
        patch(
            "services.empery_deploy_agent.src.integration.compose_runner.time.sleep",
        ) as sleep_mock,
    ):
        result = runner._health("foo_service", url)

    assert result.ok is True
    assert result.details.get("attempts") == 3
    assert calls["n"] == 3
    assert sleep_mock.call_count == 2


def test_health_fails_after_all_retries(tmp_path: Path) -> None:
    runner = _runner(tmp_path, retries=3)
    url = "http://foo_service:8000/api/v1/health"

    with (
        patch(
            "services.empery_deploy_agent.src.integration.compose_runner.urllib.request.urlopen",
            side_effect=urllib.error.URLError("timed out"),
        ),
        patch(
            "services.empery_deploy_agent.src.integration.compose_runner.time.sleep",
        ) as sleep_mock,
    ):
        result = runner._health("foo_service", url)

    assert result.ok is False
    assert result.details.get("attempts") == 3
    assert "after 3 attempts" in (result.error or "")
    assert result.details.get("url") == url
    assert sleep_mock.call_count == 2
