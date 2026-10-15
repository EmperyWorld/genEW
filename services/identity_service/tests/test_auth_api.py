"""API tests for register / login / me / roles."""

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


def _seeded_admin_app():
    return _app(
        seed_operator_email="admin@eworld.local",
        seed_operator_password="StrongOpsPass9!",
        seed_operator_display_name="Admin",
    )


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


def _login(client: TestClient, email: str = "alice@example.com") -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "secretpass"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_register_and_login_round_trip() -> None:
    with TestClient(_app()) as client:
        body = _register(client)
        assert body["user"]["email"] == "alice@example.com"
        assert body["user"]["roles"] == ["member"]
        assert "identity:users:read" in body["user"]["permissions"]

        login = _login(client)
        assert login["token_type"] == "bearer"
        assert login["expires_in"] == 3600
        assert isinstance(login["access_token"], str)
        assert len(login["access_token"]) > 20
        assert login["user"]["id"] == body["user"]["id"]


def test_duplicate_register_conflict() -> None:
    with TestClient(_app()) as client:
        _register(client)
        conflict = client.post(
            "/api/v1/auth/register",
            json={
                "email": "alice@example.com",
                "password": "secretpass",
                "display_name": "Alice",
            },
        )
        assert conflict.status_code == 409
        assert conflict.json()["error_code"] == "IDENTITY_EMAIL_TAKEN"


def test_me_with_bearer() -> None:
    with TestClient(_app()) as client:
        _register(client)
        login = _login(client)
        me = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {login['access_token']}"},
        )
        assert me.status_code == 200
        assert me.json()["user"]["email"] == "alice@example.com"


def test_get_user_forbidden_without_permission() -> None:
    """Viewer lacks nothing for users:read — use a forged principal via role demotion path.

    Member has users:read; assign viewer then check roles:manage is forbidden.
    """
    with TestClient(_seeded_admin_app()) as client:
        admin_login = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@eworld.local", "password": "StrongOpsPass9!"},
        )
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["access_token"]

        registered = _register(client, email="bob@example.com")
        user_id = registered["user"]["id"]

        # Member can read users
        member_login = _login(client, email="bob@example.com")
        ok = client.get(
            f"/api/v1/users/{user_id}",
            headers={"Authorization": f"Bearer {member_login['access_token']}"},
        )
        assert ok.status_code == 200

        # Member cannot assign roles
        forbidden = client.post(
            f"/api/v1/users/{user_id}/roles",
            headers={"Authorization": f"Bearer {member_login['access_token']}"},
            json={"role": "viewer"},
        )
        assert forbidden.status_code == 403
        assert forbidden.json()["error_code"] == "IDENTITY_FORBIDDEN"

        # Admin can assign roles
        assigned = client.post(
            f"/api/v1/users/{user_id}/roles",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"role": "viewer"},
        )
        assert assigned.status_code == 200, assigned.text
        assert assigned.json()["user"]["roles"] == ["viewer"]
        assert assigned.json()["user"]["permissions"] == ["identity:users:read"]


def test_list_roles() -> None:
    with TestClient(_seeded_admin_app()) as client:
        login = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@eworld.local", "password": "StrongOpsPass9!"},
        )
        token = login.json()["access_token"]
        response = client.get(
            "/api/v1/roles",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        names = {r["name"] for r in response.json()["roles"]}
        assert names == {"admin", "operator", "member", "viewer"}


def test_invalid_credentials() -> None:
    with TestClient(_seeded_admin_app()) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@eworld.local", "password": "wrong-password"},
        )
        assert response.status_code == 401
        assert response.json()["error_code"] == "IDENTITY_INVALID_CREDENTIALS"


def test_seed_operator_password_bootstraps_admin() -> None:
    """Empty DB + SEED_OPERATOR_PASSWORD seeds admin (no changeme in env)."""
    with TestClient(
        _app(
            seed_demo_user=False,
            seed_operator_email="ops@eworld.local",
            seed_operator_password="StrongOpsPass9!",
            seed_operator_display_name="Ops",
        )
    ) as client:
        login = client.post(
            "/api/v1/auth/login",
            json={"email": "ops@eworld.local", "password": "StrongOpsPass9!"},
        )
        assert login.status_code == 200, login.text
        body = login.json()
        assert body["user"]["email"] == "ops@eworld.local"
        assert "admin" in body["user"]["roles"]
        assert body["access_token"]
