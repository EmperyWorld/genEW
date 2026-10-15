"""Basic API smoke tests for identity_service."""

from fastapi.testclient import TestClient

from services.identity_service.config import ServiceConfig
from services.identity_service.src.api.main import create_app


def _test_config(**overrides) -> ServiceConfig:
    base = {
        "database_url": "sqlite+pysqlite:///:memory:",
        "seed_demo_user": False,
        "auto_create_tables": True,
        "jwt_secret": "test-secret-identity-32bytes-min!",
    }
    base.update(overrides)
    return ServiceConfig(**base)


def test_health_endpoint() -> None:
    with TestClient(create_app(config=_test_config())) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert payload["service"] == "identity_service"
        assert "postgres" in payload["features"]
        assert "jwt_auth" in payload["features"]
        assert "token_introspect" in payload["features"]
        assert payload["database_ready"] is True


def test_login_validation() -> None:
    with TestClient(create_app(config=_test_config())) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "x", "password": "short"},
        )
        assert response.status_code == 422
        body = response.json()
        assert body["error_code"] == "IDENTITY_VALIDATION_ERROR"
