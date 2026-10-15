"""Auth BFF and middleware tests."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.identity_verifier import IdentityPrincipal
from services.empery_control_center_api.config import ServiceConfig, clear_config_cache, get_config
from services.empery_control_center_api.tests.conftest import build_test_app

TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
VALID_TOKEN = "valid-test-token"


class FakeIdentityClient:
    """Test double for identity HTTP adapter."""

    def __init__(
        self,
        *,
        valid_token: str = VALID_TOKEN,
        user_id: UUID = TEST_USER_ID,
        email: str = "operator@example.com",
        roles: list[str] | None = None,
    ) -> None:
        self.valid_token = valid_token
        self.user_id = user_id
        self.email = email
        self.roles = roles if roles is not None else ["admin"]
        self.login_calls: list[tuple[str, str]] = []
        self.register_calls: list[tuple[str, str, str | None]] = []

    async def register(
        self,
        email: str,
        password: str,
        display_name: str | None = None,
    ) -> dict:
        self.register_calls.append((email, password, display_name))
        if email == "taken@example.com":
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_EMAIL_TAKEN",
                    message="Email already registered",
                ),
                http_status=409,
            )
        resolved_name = display_name or email.split("@", 1)[0]
        return {
            "user": {
                "id": str(self.user_id),
                "email": email,
                "display_name": resolved_name,
                "is_active": True,
                "roles": ["member"],
                "permissions": ["identity:users:read"],
                "created_at": "2026-07-21T00:00:00Z",
            }
        }

    async def login(self, email: str, password: str) -> dict:
        self.login_calls.append((email, password))
        if email != "operator@example.com" or password != "secretpass":
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_INVALID_CREDENTIALS",
                    message="Invalid email or password",
                ),
                http_status=401,
            )
        return {
            "access_token": self.valid_token,
            "token_type": "bearer",
            "expires_in": 3600,
            "user": {
                "id": str(self.user_id),
                "email": self.email,
                "display_name": "Operator",
                "is_active": True,
                "roles": list(self.roles),
                "permissions": ["identity:users:read"],
                "created_at": "2026-07-21T00:00:00Z",
            },
        }

    async def me(self, authorization: str | None) -> dict:
        from services.empery_control_center_api.src.integration.identity_client import (
            strip_bearer_token,
        )

        token = strip_bearer_token(authorization)
        if token != self.valid_token:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_UNAUTHORIZED",
                    message="Invalid token",
                ),
                http_status=401,
            )
        return {
            "user": {
                "id": str(self.user_id),
                "email": self.email,
                "display_name": "Operator",
                "is_active": True,
                "roles": list(self.roles),
                "permissions": ["identity:users:read"],
                "created_at": "2026-07-21T00:00:00Z",
            },
        }

    async def introspect_token(self, token: str) -> IdentityPrincipal:
        if token != self.valid_token:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="ECC_UNAUTHORIZED",
                    message="Invalid token",
                ),
                http_status=401,
            )
        return IdentityPrincipal(
            user_id=self.user_id,
            email=self.email,
            roles=list(self.roles),
            permissions=["identity:users:read"],
        )

    async def request_password_reset(self, email: str) -> dict:
        return {"ok": True, "message": "Reset token issued", "reset_token": "stub-token"}

    async def confirm_password_reset(self, token: str, new_password: str) -> dict:
        return {"ok": True}

    async def list_roles(self, authorization: str | None) -> dict:
        from services.empery_control_center_api.src.integration.identity_client import (
            strip_bearer_token,
        )

        strip_bearer_token(authorization)
        return {
            "roles": [
                {
                    "id": "22222222-2222-2222-2222-222222222222",
                    "name": "admin",
                    "permissions": ["identity:users:read"],
                    "created_at": "2026-07-21T00:00:00Z",
                }
            ]
        }

    async def get_user(self, user_id: UUID, authorization: str | None) -> dict:
        from services.empery_control_center_api.src.integration.identity_client import (
            strip_bearer_token,
        )

        strip_bearer_token(authorization)
        return {
            "user": {
                "id": str(user_id),
                "email": self.email,
                "display_name": "Operator",
                "is_active": True,
                "roles": ["admin"],
                "permissions": ["identity:users:read"],
                "created_at": "2026-07-21T00:00:00Z",
            }
        }

    async def assign_role(
        self, user_id: UUID, role: str, authorization: str | None
    ) -> dict:
        from services.empery_control_center_api.src.integration.identity_client import (
            strip_bearer_token,
        )

        strip_bearer_token(authorization)
        return {
            "user": {
                "id": str(user_id),
                "email": self.email,
                "display_name": "Operator",
                "is_active": True,
                "roles": [role],
                "permissions": ["identity:users:read"],
                "created_at": "2026-07-21T00:00:00Z",
            }
        }


def _auth_headers(token: str = VALID_TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _build_with_fake_identity(
    tmp_path: Path,
    *,
    require_auth: bool = False,
    identity: FakeIdentityClient | None = None,
) -> TestClient:
    app, _ = build_test_app(
        tmp_path,
        config=ServiceConfig(
            orchestration_root=str(tmp_path / "orchestration"),
            allow_demo_runner=True,
            require_auth=require_auth,
            identity_api_base="http://identity.test",
        ),
    )
    fake = identity or FakeIdentityClient()
    app.state.container.register(
        "identity_client",
        lambda _c, client=fake: client,
    )
    return TestClient(app)


def test_register_success(tmp_path: Path) -> None:
    fake = FakeIdentityClient()
    with _build_with_fake_identity(tmp_path, identity=fake) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "secretpass",
                "display_name": "New User",
            },
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["user"]["email"] == "newuser@example.com"
        assert body["user"]["display_name"] == "New User"
        assert fake.register_calls == [
            ("newuser@example.com", "secretpass", "New User")
        ]


def test_register_exempt_when_require_auth_true(tmp_path: Path) -> None:
    fake = FakeIdentityClient()
    with _build_with_fake_identity(
        tmp_path, require_auth=True, identity=fake
    ) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "secretpass",
            },
        )
        assert response.status_code == 201, response.text
        assert response.json()["user"]["email"] == "newuser@example.com"


def test_register_duplicate_email(tmp_path: Path) -> None:
    with _build_with_fake_identity(tmp_path) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "taken@example.com",
                "password": "secretpass",
                "display_name": "Taken",
            },
        )
        assert response.status_code == 409
        assert response.json()["error_code"] == "IDENTITY_EMAIL_TAKEN"


def test_login_and_me_proxy(tmp_path: Path) -> None:
    fake = FakeIdentityClient()
    with _build_with_fake_identity(tmp_path, identity=fake) as client:
        login = client.post(
            "/api/v1/auth/login",
            json={"email": "operator@example.com", "password": "secretpass"},
        )
        assert login.status_code == 200, login.text
        body = login.json()
        assert body["access_token"] == VALID_TOKEN
        assert body["user"]["email"] == "operator@example.com"

        me = client.get("/api/v1/auth/me", headers=_auth_headers())
        assert me.status_code == 200
        assert me.json()["email"] == "operator@example.com"

        logout = client.post("/api/v1/auth/logout")
        assert logout.status_code == 200
        assert logout.json()["ok"] is True


def test_login_invalid_credentials(tmp_path: Path) -> None:
    with _build_with_fake_identity(tmp_path) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "operator@example.com", "password": "wrongpass"},
        )
        assert response.status_code == 401
        assert response.json()["error_code"] == "IDENTITY_INVALID_CREDENTIALS"


def test_mutating_allowed_without_auth_when_require_auth_false(tmp_path: Path) -> None:
    with _build_with_fake_identity(tmp_path, require_auth=False) as client:
        response = client.post(
            "/api/v1/commands/plan",
            json={"intent": "Plan agent job", "service_name": "demo_service", "mode": "agent"},
        )
        assert response.status_code == 201


def test_mutating_requires_bearer_when_require_auth_true(tmp_path: Path) -> None:
    with _build_with_fake_identity(tmp_path, require_auth=True) as client:
        denied = client.post(
            "/api/v1/commands/plan",
            json={"intent": "Plan agent job", "service_name": "demo_service", "mode": "agent"},
        )
        assert denied.status_code == 401
        assert denied.json()["error_code"] == "ECC_UNAUTHORIZED"

        allowed = client.post(
            "/api/v1/commands/plan",
            json={"intent": "Plan agent job", "service_name": "demo_service", "mode": "agent"},
            headers=_auth_headers(),
        )
        assert allowed.status_code == 201


def test_invalid_token_rejected_when_require_auth_true(tmp_path: Path) -> None:
    with _build_with_fake_identity(tmp_path, require_auth=True) as client:
        response = client.post(
            "/api/v1/commands/plan",
            json={"intent": "Plan agent job", "service_name": "demo_service", "mode": "agent"},
            headers=_auth_headers("bad-token"),
        )
        assert response.status_code == 401
        assert response.json()["error_code"] == "ECC_UNAUTHORIZED"


def test_health_and_login_exempt_when_require_auth_true(tmp_path: Path) -> None:
    with _build_with_fake_identity(tmp_path, require_auth=True) as client:
        health = client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json()["auth_required"] is True

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "wrong@example.com", "password": "secretpass"},
        )
        assert login.status_code == 401

        register = client.post(
            "/api/v1/auth/register",
            json={
                "email": "guest@example.com",
                "password": "secretpass",
                "display_name": "Guest",
            },
        )
        assert register.status_code == 201

        listed = client.get("/api/v1/jobs")
        assert listed.status_code == 401
        assert listed.json()["error_code"] == "ECC_UNAUTHORIZED"


def test_require_auth_defaults_true_unless_explicitly_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clear_config_cache()
    monkeypatch.delenv("ECC_REQUIRE_AUTH", raising=False)
    monkeypatch.setenv("EMPERY_ENV", "development")
    clear_config_cache()
    assert get_config().require_auth is True

    monkeypatch.setenv("EMPERY_ENV", "production")
    clear_config_cache()
    assert get_config().require_auth is True

    monkeypatch.setenv("ECC_REQUIRE_AUTH", "false")
    clear_config_cache()
    assert get_config().require_auth is False


def test_password_reset_bff_proxy(tmp_path: Path) -> None:
    fake = FakeIdentityClient()
    with _build_with_fake_identity(tmp_path, identity=fake) as client:
        request = client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": "operator@example.com"},
        )
        assert request.status_code == 200
        body = request.json()
        assert body["ok"] is True
        assert body["reset_token"] == "stub-token"

        confirm = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": "reset-token", "new_password": "newsecret1"},
        )
        assert confirm.status_code == 200
        assert confirm.json()["ok"] is True


def test_identity_roles_bff_proxy(tmp_path: Path) -> None:
    fake = FakeIdentityClient()
    with _build_with_fake_identity(
        tmp_path, require_auth=True, identity=fake
    ) as client:
        roles = client.get("/api/v1/identity/roles", headers=_auth_headers())
        assert roles.status_code == 200
        assert roles.json()["roles"][0]["name"] == "admin"

        user = client.get(
            f"/api/v1/identity/users/{TEST_USER_ID}",
            headers=_auth_headers(),
        )
        assert user.status_code == 200
        assert user.json()["email"] == "operator@example.com"

        assign = client.post(
            f"/api/v1/identity/users/{TEST_USER_ID}/roles",
            json={"role": "viewer"},
            headers=_auth_headers(),
        )
        assert assign.status_code == 200
        assert assign.json()["user"]["roles"] == ["viewer"]
