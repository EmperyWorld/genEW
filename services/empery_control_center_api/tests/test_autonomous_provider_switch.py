"""Runtime provider switch via Autonomous gateway."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from core.container import ServiceContainer
from core.logging import configure_logging
from services.empery_control_center_api.src.api.main import create_app
from services.empery_control_center_api.tests.conftest import (
    RecordingEventBus,
    make_config,
)
from services.empery_intelligence_core.config import ServiceConfig as EicConfig
from services.empery_intelligence_core.src.api.wire_autonomous import wire_autonomous


def _build(tmp_path: Path, *, openai_key: str = ""):
    container = ServiceContainer()
    bus = RecordingEventBus()
    container.register("event_bus", lambda _c: bus)
    container.register(
        "logger", lambda _c: configure_logging("ecc_provider_test")
    )
    eic_cfg = EicConfig(
        provider_id="local",
        autonomous_enabled=True,
        use_fake_nervas=True,
        allow_autonomous_fakes=True,
        require_deploy_agent=False,
        auto_deploy_on_implement=False,
        worker_enabled=False,
        openai_api_key=openai_key,
        provider_runtime_path=str(tmp_path / "provider_runtime.json"),
        provider_config_path=str(tmp_path / "nervas_runtime.json"),
        llm_base_url="http://127.0.0.1:8080",
        orchestration_root=str(tmp_path / "orchestration"),
        workspace_root=str(tmp_path),
    )
    container.register("config", lambda _c: eic_cfg)
    container.register("eic_config", lambda _c: eic_cfg)
    wire_autonomous(container, eic_cfg)
    app = create_app(container=container, config=make_config(tmp_path))
    return app, bus


def test_provider_switch_updates_active(tmp_path: Path) -> None:
    app, bus = _build(tmp_path)
    with TestClient(app) as client:
        before = client.get("/api/v1/autonomous/providers")
        assert before.status_code == 200
        body = before.json()
        assert body["active_provider_id"] == "local"
        assert "llm_base_url" in body
        dumped = str(body)
        assert "api_key" not in dumped.lower()
        assert "sk-" not in dumped

        switched = client.put(
            "/api/v1/autonomous/providers",
            json={"provider_id": "fake"},
        )
        assert switched.status_code == 200
        payload = switched.json()
        assert payload["switched"] is True
        assert payload["config"]["active_provider_id"] == "fake"
        assert payload["config"]["runtime_override"] is True

        after = client.get("/api/v1/autonomous/providers")
        assert after.json()["active_provider_id"] == "fake"

        event_names = {e.name for e in bus.published}
        assert "eic.provider.changed" in event_names


def test_unconfigured_cloud_provider_rejected(tmp_path: Path) -> None:
    app, _ = _build(tmp_path, openai_key="")
    with TestClient(app) as client:
        r = client.put(
            "/api/v1/autonomous/providers",
            json={"provider_id": "openai"},
        )
        assert r.status_code == 400
        assert r.json()["error_code"] == "EIC_PROVIDER_NOT_CONFIGURED"


def test_provider_request_rejects_secret_fields(tmp_path: Path) -> None:
    app, _ = _build(tmp_path)
    with TestClient(app) as client:
        r = client.put(
            "/api/v1/autonomous/providers",
            json={
                "provider_id": "fake",
                "api_key": "sk-should-not-be-accepted",
            },
        )
        assert r.status_code == 200
        assert "sk-should-not-be-accepted" not in str(r.json())
