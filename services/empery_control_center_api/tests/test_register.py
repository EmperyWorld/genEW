"""Registry registration and DI wiring tests."""

from pathlib import Path

from fastapi.testclient import TestClient

from core.registry import GlobalServiceRegistry, register_all_services
from services.empery_control_center_api.src.api.main import (
    load_manifest,
    register,
)
from services.empery_control_center_api.tests.conftest import build_test_app


def test_register_exposes_service() -> None:
    registry = GlobalServiceRegistry()
    register(registry)
    assert "empery_control_center_api" in registry.list_services()
    manifest = registry.get_manifest("empery_control_center_api")
    assert manifest.name == "empery_control_center_api"
    assert "command_gateway" in manifest.features
    assert "event_streamer_ws" in manifest.features


def test_load_manifest_validates() -> None:
    manifest = load_manifest()
    assert manifest.entry_point == "src/api/main.py"
    assert "empery_intelligence_core" in manifest.dependencies
    assert "identity_service" in manifest.dependencies
    assert "eic.intention.requested" in manifest.publishes
    assert "task.created" in manifest.subscribes


def test_create_app_resolves_providers(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    container = app.state.container
    for name in (
        "logger",
        "config",
        "event_bus",
        "orchestration_paths",
        "job_store",
        "audit_reader",
        "registry_snapshot",
        "ws_hub",
        "event_bridge",
        "eic_intention_bridge",
        "ecc_use_cases",
    ):
        assert container.has(name), f"missing provider {name}"
        container.resolve(name)


def test_register_all_services_includes_ecc() -> None:
    registry = register_all_services()
    assert "empery_control_center_api" in registry.list_services()


def test_orchestration_paths_endpoint(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        r = client.get("/api/v1/orchestration/paths")
        assert r.status_code == 200
        body = r.json()
        assert "jobs_root" in body
        assert str(tmp_path) in body["orchestration_root"]
