"""Integration tests for DB-backed auth and AI profiling."""

from __future__ import annotations

from fastapi.testclient import TestClient

from core.container import ServiceContainer
from core.data.database import DatabaseManager
from services.core_auth_service.config import ServiceConfig
from services.core_auth_service.src.api.main import create_app
from services.core_auth_service.src.integration.ai_chat import CoreAuthAIProvider


def _app(**overrides):
    values = {
        "database_url": "sqlite+pysqlite:///:memory:",
        "seed_demo_user": False,
        "auto_create_tables": True,
        "ai_chat_api_key": "",
    }
    values.update(overrides)
    return create_app(config=ServiceConfig(**values))


def _register_admin(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin@example.com",
            "password": "secretpass",
            "display_name": "Admin",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_register_login_persists_session_and_profile() -> None:
    with TestClient(_app()) as client:
        registered = _register_admin(client)
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@example.com", "password": "secretpass"},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["token_type"] == "bearer"
        assert isinstance(payload["access_token"], str)
        assert len(payload["access_token"]) >= 16
        assert payload["user"]["email"] == "admin@example.com"
        assert payload["user"]["id"] == registered["user"]["id"]
        assert payload["profile"] is not None
        assert payload["profile"]["summary"]
        assert payload["profile"]["traits"]
        assert payload["profile"]["interests"]
        assert payload["profile"]["provider"] == "local_deterministic"
        assert 0.0 <= payload["profile"]["confidence"] <= 1.0

        profile_resp = client.get(
            f"/api/v1/auth/users/{payload['user']['id']}/profile"
        )
        assert profile_resp.status_code == 200
        assert profile_resp.json()["profile"]["user_id"] == payload["user"]["id"]


def test_register_and_login_round_trip() -> None:
    with TestClient(_app()) as client:
        register = client.post(
            "/api/v1/auth/register",
            json={
                "email": "alice@example.com",
                "password": "secretpass",
                "display_name": "Alice",
            },
        )
        assert register.status_code == 200, register.text
        body = register.json()
        assert body["user"]["email"] == "alice@example.com"
        assert body["profile"]["provider"] == "local_deterministic"

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "alice@example.com", "password": "secretpass"},
        )
        assert login.status_code == 200
        assert login.json()["user"]["id"] == body["user"]["id"]
        assert login.json()["profile"]["summary"]


def test_invalid_credentials_against_db() -> None:
    with TestClient(_app()) as client:
        _register_admin(client)
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@example.com", "password": "wrong-password"},
        )
        assert response.status_code == 401
        assert response.json()["error_code"] == "AUTH_INVALID_CREDENTIALS"


def test_duplicate_register_conflict() -> None:
    with TestClient(_app()) as client:
        payload = {
            "email": "bob@example.com",
            "password": "secretpass",
            "display_name": "Bob",
        }
        assert client.post("/api/v1/auth/register", json=payload).status_code == 200
        conflict = client.post("/api/v1/auth/register", json=payload)
        assert conflict.status_code == 409
        assert conflict.json()["error_code"] == "AUTH_EMAIL_EXISTS"


def test_chat_assist_uses_ai_provider() -> None:
    with TestClient(_app()) as client:
        registered = _register_admin(client)
        user_id = registered["user"]["id"]
        chat = client.post(
            "/api/v1/auth/chat",
            json={
                "user_id": user_id,
                "messages": [{"role": "user", "content": "Hello profiling world"}],
            },
        )
        assert chat.status_code == 200, chat.text
        body = chat.json()
        assert body["message"]["role"] == "assistant"
        assert "Hello profiling world" in body["message"]["content"]
        assert body["provider"] == "local_deterministic"


def test_ai_provider_resolves_via_container() -> None:
    container = ServiceContainer()
    config = ServiceConfig(
        database_url="sqlite+pysqlite:///:memory:",
        ai_chat_api_key="",
    )
    container.register("config", lambda _c: config)
    container.register(
        "database_manager",
        lambda c: DatabaseManager.from_url(c.resolve("config").database_url),
    )
    import logging

    logger = logging.getLogger("test_ai_provider")
    container.register("logger", lambda _c: logger)
    container.register(
        "ai_provider",
        lambda c: CoreAuthAIProvider(c.resolve("config"), c.resolve("logger")),
    )
    provider = container.resolve("ai_provider")
    assert isinstance(provider, CoreAuthAIProvider)
