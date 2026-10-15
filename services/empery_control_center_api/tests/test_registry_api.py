"""Registry snapshot API tests."""

from pathlib import Path

from fastapi.testclient import TestClient

from core.registry import GlobalServiceRegistry, register_all_services
from services.empery_control_center_api.src.api.main import create_app, register
from services.empery_control_center_api.src.integration.registry_adapter import (
    RegistrySnapshotAdapter,
)
from services.empery_control_center_api.tests.conftest import (
    RecordingEventBus,
    build_test_app,
    make_config,
)
from core.container import ServiceContainer


def test_registry_snapshot_from_bound_registry(tmp_path: Path) -> None:
    registry = GlobalServiceRegistry()
    register(registry)
    app, bus = build_test_app(tmp_path, registry=registry)
    with TestClient(app) as client:
        r = client.get("/api/v1/registry")
        assert r.status_code == 200
        names = [s["name"] for s in r.json()["snapshot"]["services"]]
        assert "empery_control_center_api" in names

        refresh = client.post("/api/v1/registry/refresh")
        assert refresh.status_code == 200
        assert any(e.name == "ecc.registry.refreshed" for e in bus.published)


def test_registry_sees_other_services_via_register_all(tmp_path: Path) -> None:
    """When using register_all_services, snapshot includes peer services."""
    registry = register_all_services()
    bus = RecordingEventBus()
    container = ServiceContainer()
    container.register("event_bus", lambda _c: bus)
    container.register(
        "registry_snapshot",
        lambda _c: RegistrySnapshotAdapter(registry),
    )
    # Prefer shared container providers already registered by register()
    app = create_app(container=container, config=make_config(tmp_path))
    with TestClient(app) as client:
        r = client.get("/api/v1/registry")
        assert r.status_code == 200
        names = {s["name"] for s in r.json()["snapshot"]["services"]}
        for expected in (
            "empery_control_center_api",
            "empery_intelligence_core",
            "identity_service",
            "task_orchestrator_service",
            "intelligence_service",
            "core_auth_service",
            "analytics_service",
        ):
            assert expected in names
