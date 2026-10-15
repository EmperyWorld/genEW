"""LLM health probe via Autonomous gateway."""

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
from services.empery_intelligence_core.tests.fakes import (
    InMemoryNervasProviderRegistry,
)


def _build(tmp_path: Path):
    container = ServiceContainer()
    bus = RecordingEventBus()
    container.register("event_bus", lambda _c: bus)
    container.register(
        "logger", lambda _c: configure_logging("ecc_llm_health_test")
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
        llm_health_timeout_ms=2000,
        orchestration_root=str(tmp_path / "orchestration"),
        workspace_root=str(tmp_path),
    )
    container.register("config", lambda _c: eic_cfg)
    container.register("eic_config", lambda _c: eic_cfg)
    wire_autonomous(container, eic_cfg)
    app = create_app(container=container, config=make_config(tmp_path))
    return app, container, bus


def test_llm_health_ok(tmp_path: Path) -> None:
    app, _container, bus = _build(tmp_path)
    with TestClient(app) as client:
        r = client.get("/api/v1/autonomous/llm/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body["provider_id"] == "fake"
        assert body["latency_ms"] is not None
        assert "eic.llm.health" in {e.name for e in bus.published}


def test_llm_health_down(tmp_path: Path) -> None:
    app, container, _ = _build(tmp_path)
    registry = container.resolve("nervas_provider_registry")
    assert isinstance(registry, InMemoryNervasProviderRegistry)
    registry.force_health("down")
    with TestClient(app) as client:
        r = client.get("/api/v1/autonomous/llm/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "down"
        assert body["latency_ms"] is None


def test_llm_health_degraded_timeout(tmp_path: Path) -> None:
    app, container, _ = _build(tmp_path)
    registry = container.resolve("nervas_provider_registry")
    assert isinstance(registry, InMemoryNervasProviderRegistry)
    registry.force_health("degraded")
    with TestClient(app) as client:
        r = client.get("/api/v1/autonomous/llm/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "degraded"
        assert body["latency_ms"] == 2000
