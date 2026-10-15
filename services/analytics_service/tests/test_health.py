"""Basic API smoke tests for analytics_service."""

from fastapi.testclient import TestClient

from core.registry import register_all_services
from services.analytics_service.config import ServiceConfig
from services.analytics_service.src.api.main import create_app


def _test_config(**overrides) -> ServiceConfig:
    base = {
        "database_url": "sqlite+pysqlite:///:memory:",
        "auto_create_tables": True,
    }
    base.update(overrides)
    return ServiceConfig(**base)


def test_health_endpoint() -> None:
    with TestClient(create_app(config=_test_config())) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert payload["service"] == "analytics_service"
        assert "postgres" in payload["features"]
        assert "event_ingest" in payload["features"]
        assert "event_query" in payload["features"]
        assert "aggregates" in payload["features"]
        assert payload["database_ready"] is True


def test_registered_in_global_registry() -> None:
    registry = register_all_services()
    assert "analytics_service" in registry.list_services()
    manifest = registry.get_manifest("analytics_service")
    assert manifest.name == "analytics_service"
    assert "event_ingest" in manifest.features
