"""API tests for GET /users/lookup?email=."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.identity_service.tests.test_auth_api import (
    _register,
    _seeded_admin_app,
)


def test_lookup_user_by_email() -> None:
    with TestClient(_seeded_admin_app()) as client:
        admin_login = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@eworld.local", "password": "StrongOpsPass9!"},
        )
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["access_token"]

        registered = _register(client, email="lookup@example.com")
        user_id = registered["user"]["id"]

        found = client.get(
            "/api/v1/users/lookup",
            params={"email": "Lookup@example.com"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert found.status_code == 200, found.text
        assert found.json()["user"]["id"] == user_id
        assert found.json()["user"]["email"] == "lookup@example.com"

        missing = client.get(
            "/api/v1/users/lookup",
            params={"email": "missing@example.com"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert missing.status_code == 404
        assert missing.json()["error_code"] == "IDENTITY_USER_NOT_FOUND"


def test_lookup_user_by_email_requires_auth() -> None:
    with TestClient(_seeded_admin_app()) as client:
        anon = client.get(
            "/api/v1/users/lookup",
            params={"email": "admin@eworld.local"},
        )
        assert anon.status_code in {401, 403}
