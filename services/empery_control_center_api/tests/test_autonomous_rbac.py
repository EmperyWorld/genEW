"""Autonomous RBAC — write vs read-only by JWT role."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.container import ServiceContainer
from core.logging import configure_logging
from services.empery_control_center_api.src.api.autonomous_rbac import (
    can_autonomous_write,
    is_autonomous_mutating_path,
)
from services.empery_control_center_api.src.api.main import create_app
from services.empery_control_center_api.tests.conftest import (
    RecordingEventBus,
    make_config,
)
from services.empery_control_center_api.tests.test_auth_bff import (
    FakeIdentityClient,
    _auth_headers,
)
from services.empery_intelligence_core.config import ServiceConfig as EicConfig
from services.empery_intelligence_core.src.api.wire_autonomous import wire_autonomous


@pytest.mark.parametrize(
    ("method", "path", "expected"),
    [
        ("GET", "/api/v1/autonomous/mode", False),
        ("PUT", "/api/v1/autonomous/mode", True),
        ("POST", "/api/v1/autonomous/intentions", True),
        ("POST", "/api/v1/jobs", False),
    ],
)
def test_is_autonomous_mutating_path(method: str, path: str, expected: bool) -> None:
    assert is_autonomous_mutating_path(method, path) is expected


@pytest.mark.parametrize(
    ("roles", "expected"),
    [
        (["viewer"], False),
        (["admin"], True),
        (["operator"], True),
        (["member"], True),
        (["viewer", "operator"], True),
        ([], False),
    ],
)
def test_can_autonomous_write(roles: list[str], expected: bool) -> None:
    assert can_autonomous_write(roles) is expected


def _build_autonomous_client(
    tmp_path: Path,
    *,
    roles: list[str],
) -> TestClient:
    container = ServiceContainer()
    bus = RecordingEventBus()
    container.register("event_bus", lambda _c: bus)
    container.register(
        "logger", lambda _c: configure_logging("ecc_autonomous_rbac_test")
    )
    eic_cfg = EicConfig(
        provider_id="fake",
        autonomous_enabled=True,
        use_fake_nervas=True,
        allow_autonomous_fakes=True,
        require_deploy_agent=False,
        auto_deploy_on_implement=False,
        worker_enabled=False,
        provider_runtime_path=str(tmp_path / "provider_runtime.json"),
        provider_config_path=str(tmp_path / "nervas_runtime.json"),
        orchestration_root=str(tmp_path / "orchestration"),
        workspace_root=str(tmp_path),
    )
    container.register("config", lambda _c: eic_cfg)
    container.register("eic_config", lambda _c: eic_cfg)
    wire_autonomous(container, eic_cfg)

    ecc_cfg = make_config(tmp_path, require_auth=True)
    app = create_app(container=container, config=ecc_cfg)
    fake = FakeIdentityClient(roles=roles)
    app.state.container.register("identity_client", lambda _c, client=fake: client)
    return TestClient(app)


def test_viewer_can_read_autonomous_but_not_write(tmp_path: Path) -> None:
    with _build_autonomous_client(tmp_path, roles=["viewer"]) as client:
        read = client.get("/api/v1/autonomous/mode", headers=_auth_headers())
        assert read.status_code == 200

        write = client.put(
            "/api/v1/autonomous/mode",
            json={"enabled": True},
            headers=_auth_headers(),
        )
        assert write.status_code == 403
        assert write.json()["error_code"] == "ECC_FORBIDDEN"


def test_operator_can_write_autonomous(tmp_path: Path) -> None:
    with _build_autonomous_client(tmp_path, roles=["operator"]) as client:
        write = client.put(
            "/api/v1/autonomous/mode",
            json={"enabled": True},
            headers=_auth_headers(),
        )
        assert write.status_code == 200


def test_member_can_write_autonomous_back_compat(tmp_path: Path) -> None:
    with _build_autonomous_client(tmp_path, roles=["member"]) as client:
        write = client.put(
            "/api/v1/autonomous/mode",
            json={"enabled": True},
            headers=_auth_headers(),
        )
        assert write.status_code == 200


def test_autonomous_write_skipped_when_require_auth_false(tmp_path: Path) -> None:
    container = ServiceContainer()
    bus = RecordingEventBus()
    container.register("event_bus", lambda _c: bus)
    container.register(
        "logger", lambda _c: configure_logging("ecc_autonomous_rbac_test")
    )
    eic_cfg = EicConfig(
        provider_id="fake",
        autonomous_enabled=True,
        use_fake_nervas=True,
        allow_autonomous_fakes=True,
        require_deploy_agent=False,
        auto_deploy_on_implement=False,
        worker_enabled=False,
        provider_runtime_path=str(tmp_path / "provider_runtime.json"),
        provider_config_path=str(tmp_path / "nervas_runtime.json"),
        orchestration_root=str(tmp_path / "orchestration"),
        workspace_root=str(tmp_path),
    )
    container.register("config", lambda _c: eic_cfg)
    container.register("eic_config", lambda _c: eic_cfg)
    wire_autonomous(container, eic_cfg)

    ecc_cfg = make_config(tmp_path, require_auth=False)
    app = create_app(container=container, config=ecc_cfg)
    with TestClient(app) as client:
        write = client.put("/api/v1/autonomous/mode", json={"enabled": True})
        assert write.status_code == 200
