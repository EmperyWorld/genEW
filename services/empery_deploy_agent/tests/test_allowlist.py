"""Unit tests for deploy-agent allowlist."""

from __future__ import annotations

from pathlib import Path

import pytest

from services.empery_deploy_agent.src.core.allowlist import (
    build_compose_argv,
    validate_health_url,
    validate_service_name,
)
from services.empery_deploy_agent.src.core.contracts import DeployAction


def test_validate_service_name_ok() -> None:
    assert validate_service_name("evolution_probe_service") == "evolution_probe_service"


def test_validate_service_name_rejects_shell() -> None:
    with pytest.raises(ValueError):
        validate_service_name("foo;rm")


def test_build_compose_up(tmp_path: Path) -> None:
    (tmp_path / "compose.yml").write_text("services: {}\n", encoding="utf-8")
    argv = build_compose_argv(
        workspace=tmp_path,
        service_name="foo_service",
        action=DeployAction.UP,
    )
    assert argv[0] == "podman-compose"
    assert "-d" in argv
    assert "--no-deps" in argv
    assert "--force-recreate" in argv
    assert argv[-1] == "foo_service"
    assert "down" not in argv


def test_build_compose_rebuild_steps(tmp_path: Path) -> None:
    from services.empery_deploy_agent.src.core.allowlist import (
        build_compose_argv_steps,
    )

    (tmp_path / "compose.yml").write_text("services: {}\n", encoding="utf-8")
    steps = build_compose_argv_steps(
        workspace=tmp_path,
        service_name="empery_desktop_ui",
        action=DeployAction.REBUILD,
    )
    assert len(steps) == 2
    assert steps[0][-2:] == ["build", "empery_desktop_ui"]
    assert "--no-cache" not in steps[0]
    assert "--force-recreate" in steps[1]
    assert steps[1][-1] == "empery_desktop_ui"


def test_build_compose_restart(tmp_path: Path) -> None:
    (tmp_path / "compose.yml").write_text("services: {}\n", encoding="utf-8")
    argv = build_compose_argv(
        workspace=tmp_path,
        service_name="empery_control_center_api",
        action=DeployAction.RESTART,
    )
    assert argv == [
        "podman",
        "restart",
        "empery_empery_control_center_api_1",
    ]


def test_build_compose_stop(tmp_path: Path) -> None:
    (tmp_path / "compose.yml").write_text("services: {}\n", encoding="utf-8")
    argv = build_compose_argv(
        workspace=tmp_path,
        service_name="foo_service",
        action=DeployAction.STOP,
    )
    assert argv[-2:] == ["stop", "foo_service"]
    assert "down" not in argv
    assert "rm" not in argv


def test_stop_refuses_spine(tmp_path: Path) -> None:
    (tmp_path / "compose.yml").write_text("services: {}\n", encoding="utf-8")
    with pytest.raises(ValueError, match="spine"):
        build_compose_argv(
            workspace=tmp_path,
            service_name="postgres",
            action=DeployAction.STOP,
        )
    url = validate_health_url(
        "http://foo_service:8036/api/v1/health", service_name="foo_service"
    )
    assert "foo_service" in url
    with pytest.raises(ValueError):
        validate_health_url("http://evil.example/x", service_name="foo_service")
