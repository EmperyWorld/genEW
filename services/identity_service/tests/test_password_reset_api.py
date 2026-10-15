"""API tests for admin-mediated password reset."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.identity_service.config import ServiceConfig
from services.identity_service.src.api.main import create_app

_GENERIC_MESSAGE = (
    "If an account with that email exists, an administrator can issue a reset "
    "token. Email delivery is not configured on this stand."
)


def _app(**overrides):
    values = {
        "database_url": "sqlite+pysqlite:///:memory:",
        "seed_demo_user": False,
        "auto_create_tables": True,
        "jwt_secret": "test-secret-identity-32bytes-min!",
        "empery_env": "development",
        "password_reset_reveal": False,
    }
    values.update(overrides)
    return create_app(config=ServiceConfig(**values))


def _register(client: TestClient, email: str = "alice@example.com") -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "secretpass",
            "display_name": "Alice",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_password_reset_request_unknown_email_same_response() -> None:
    with TestClient(_app()) as client:
        response = client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": "missing@example.com"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["message"] == _GENERIC_MESSAGE
        assert body.get("reset_token") is None


def test_password_reset_request_reveals_token_in_development() -> None:
    with TestClient(_app(empery_env="development")) as client:
        _register(client)
        response = client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": "alice@example.com"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["message"] == _GENERIC_MESSAGE
        assert isinstance(body["reset_token"], str)
        assert len(body["reset_token"]) > 20


def test_password_reset_request_reveals_token_when_flag_set() -> None:
    with TestClient(
        _app(empery_env="production", password_reset_reveal=True)
    ) as client:
        _register(client)
        response = client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": "alice@example.com"},
        )
        assert response.status_code == 200
        assert isinstance(response.json()["reset_token"], str)


def test_password_reset_request_hides_token_in_production() -> None:
    with TestClient(
        _app(empery_env="production", password_reset_reveal=False)
    ) as client:
        _register(client)
        response = client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": "alice@example.com"},
        )
        assert response.status_code == 200
        assert response.json().get("reset_token") is None


def test_password_reset_confirm_round_trip() -> None:
    with TestClient(_app()) as client:
        _register(client)
        request = client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": "alice@example.com"},
        )
        token = request.json()["reset_token"]
        assert token

        confirm = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": token, "new_password": "newsecret1"},
        )
        assert confirm.status_code == 200
        assert confirm.json()["message"] == "Password has been reset successfully."

        old_login = client.post(
            "/api/v1/auth/login",
            json={"email": "alice@example.com", "password": "secretpass"},
        )
        assert old_login.status_code == 401

        new_login = client.post(
            "/api/v1/auth/login",
            json={"email": "alice@example.com", "password": "newsecret1"},
        )
        assert new_login.status_code == 200


def test_password_reset_confirm_rejects_short_password() -> None:
    with TestClient(_app()) as client:
        _register(client)
        token = client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": "alice@example.com"},
        ).json()["reset_token"]

        response = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": token, "new_password": "short"},
        )
        assert response.status_code == 422


def test_password_reset_confirm_rejects_invalid_token() -> None:
    with TestClient(_app()) as client:
        response = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": "not-a-valid-token", "new_password": "newsecret1"},
        )
        assert response.status_code == 400
        assert response.json()["error_code"] == "IDENTITY_RESET_TOKEN_INVALID"


def test_password_reset_token_single_use() -> None:
    with TestClient(_app()) as client:
        _register(client)
        token = client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": "alice@example.com"},
        ).json()["reset_token"]

        first = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": token, "new_password": "newsecret1"},
        )
        assert first.status_code == 200

        second = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": token, "new_password": "anotherpass"},
        )
        assert second.status_code == 400
        assert second.json()["error_code"] == "IDENTITY_RESET_TOKEN_USED"
