"""Basic API smoke tests for task_orchestrator_service."""

from fastapi.testclient import TestClient

from core.registry import GlobalServiceRegistry
from services.task_orchestrator_service.src.api.main import register
from services.task_orchestrator_service.tests.conftest import build_test_app


def test_health_endpoint() -> None:
    with TestClient(build_test_app()) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert payload["service"] == "task_orchestrator_service"
        assert "postgres" in payload["features"]
        assert "kanban_tasks" in payload["features"]
        assert "identity_gated_writes" in payload["features"]
        assert "task_lifecycle_events" in payload["features"]
        assert payload["database_ready"] is True


def test_register_exposes_manifest() -> None:
    registry = GlobalServiceRegistry()
    register(registry)
    assert "task_orchestrator_service" in registry.list_services()
    manifest = registry.get_manifest("task_orchestrator_service")
    assert manifest.name == "task_orchestrator_service"
    assert "kanban_tasks" in manifest.features
    assert "identity_service" in manifest.dependencies
