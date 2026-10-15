"""Basic API smoke tests for core_auth_service."""

from fastapi.testclient import TestClient

from services.core_auth_service.config import ServiceConfig
from services.core_auth_service.src.api.main import create_app


def _test_config(**overrides) -> ServiceConfig:
    base = {
        "database_url": "sqlite+pysqlite:///:memory:",
        "seed_demo_user": False,
        "auto_create_tables": True,
        "ai_chat_api_key": "",
    }
    base.update(overrides)
    return ServiceConfig(**base)


def test_health_endpoint() -> None:
    client = TestClient(create_app(config=_test_config()))
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "core_auth_service"
    assert "postgres" in payload["features"]
    assert "ai_chat" in payload["features"]
    assert "ai_profiling" in payload["features"]
    assert payload["database_ready"] is True


def test_login_validation() -> None:
    client = TestClient(create_app(config=_test_config()))
    response = client.post("/api/v1/auth/login", json={"email": "x", "password": "short"})
    assert response.status_code == 422
    body = response.json()
    assert body["error_code"] == "AUTH_VALIDATION_ERROR"
