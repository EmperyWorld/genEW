"""API tests for token introspection."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.identity_service.config import ServiceConfig
from services.identity_service.src.api.main import create_app


def _app(**overrides):
    values = {
        "database_url": "sqlite+pysqlite:///:memory:",
        "seed_demo_user": False,
        "auto_create_tables": True,
        "jwt_secret": "test-secret-identity-32bytes-min!",
    }
    values.update(overrides)
    return create_app(config=ServiceConfig(**values))


def _token(client: TestClient) -> str:
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "alice@example.com",
            "password": "secretpass",
            "display_name": "Alice",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "alice@example.com", "password": "secretpass"},
    )
    return login.json()["access_token"]


def test_introspect_active_via_body() -> None:
    with TestClient(_app()) as client:
        token = _token(client)
        response = client.post(
            "/api/v1/auth/introspect",
            json={"token": token},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["active"] is True
        assert body["iss"] == "identity_service"
        assert body["email"] == "alice@example.com"
        assert "member" in body["roles"]
        assert "identity:users:read" in body["permissions"]
        assert body["sub"]
        assert body["exp"]
        assert body["iat"]


def test_introspect_active_via_bearer_header() -> None:
    with TestClient(_app()) as client:
        token = _token(client)
        response = client.post(
            "/api/v1/auth/introspect",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        )
        assert response.status_code == 200
        assert response.json()["active"] is True
        assert response.json()["iss"] == "identity_service"


def test_introspect_inactive_on_garbage() -> None:
    with TestClient(_app()) as client:
        response = client.post(
            "/api/v1/auth/introspect",
            json={"token": "not-a-jwt"},
        )
        assert response.status_code == 200
        assert response.json()["active"] is False


def test_introspect_missing_token_unauthorized() -> None:
    with TestClient(_app()) as client:
        response = client.post("/api/v1/auth/introspect", json={})
        assert response.status_code == 401
        assert response.json()["error_code"] == "IDENTITY_UNAUTHORIZED"
