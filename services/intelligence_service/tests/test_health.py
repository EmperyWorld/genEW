"""Basic API smoke tests for intelligence_service."""

from fastapi.testclient import TestClient

from core.registry import GlobalServiceRegistry
from services.intelligence_service.src.api.main import register
from services.intelligence_service.tests.conftest import build_intelligence_app


def test_health_endpoint() -> None:
    with TestClient(build_intelligence_app()) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert payload["service"] == "intelligence_service"
        assert "postgres" in payload["features"]
        assert "ai_insights" in payload["features"]
        assert "event_subscribe_task_created" in payload["features"]
        assert "event_publish_insight_generated" in payload["features"]
        assert payload["database_ready"] is True
        assert payload["ai_ready"] is True


def test_register_exposes_service() -> None:
    registry = GlobalServiceRegistry()
    register(registry)
    assert "intelligence_service" in registry.list_services()
    manifest = registry.get_manifest("intelligence_service")
    assert manifest.name == "intelligence_service"
    assert "ai_insights" in manifest.features
