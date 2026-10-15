"""Read-side auth middleware tests — sensitive GET paths require Bearer."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from services.empery_control_center_api.config import ServiceConfig
from services.empery_control_center_api.tests.conftest import build_test_app
from services.empery_control_center_api.tests.test_auth_bff import (
    FakeIdentityClient,
    _auth_headers,
    _build_with_fake_identity,
)


def _client_require_auth(tmp_path: Path) -> TestClient:
    return _build_with_fake_identity(tmp_path, require_auth=True)


def test_get_jobs_requires_bearer_when_require_auth(tmp_path: Path) -> None:
    with _client_require_auth(tmp_path) as client:
        denied = client.get("/api/v1/jobs")
        assert denied.status_code == 401
        assert denied.json()["error_code"] == "ECC_UNAUTHORIZED"

        allowed = client.get("/api/v1/jobs", headers=_auth_headers())
        assert allowed.status_code == 200


def test_get_audit_requires_bearer_when_require_auth(tmp_path: Path) -> None:
    with _client_require_auth(tmp_path) as client:
        denied = client.get("/api/v1/audit")
        assert denied.status_code == 401
        assert denied.json()["error_code"] == "ECC_UNAUTHORIZED"

        allowed = client.get("/api/v1/audit", headers=_auth_headers())
        assert allowed.status_code == 200


def test_get_autonomous_jobs_requires_bearer_when_require_auth(
    tmp_path: Path,
) -> None:
    with _client_require_auth(tmp_path) as client:
        denied = client.get("/api/v1/autonomous/jobs")
        assert denied.status_code == 401
        assert denied.json()["error_code"] == "ECC_UNAUTHORIZED"


def test_get_registry_requires_bearer_when_require_auth(tmp_path: Path) -> None:
    with _client_require_auth(tmp_path) as client:
        denied = client.get("/api/v1/registry")
        assert denied.status_code == 401
        assert denied.json()["error_code"] == "ECC_UNAUTHORIZED"


def test_get_orchestration_paths_requires_bearer_when_require_auth(
    tmp_path: Path,
) -> None:
    with _client_require_auth(tmp_path) as client:
        denied = client.get("/api/v1/orchestration/paths")
        assert denied.status_code == 401
        assert denied.json()["error_code"] == "ECC_UNAUTHORIZED"


def test_health_still_public_when_require_auth(tmp_path: Path) -> None:
    with _client_require_auth(tmp_path) as client:
        health = client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json()["auth_required"] is True

        services = client.get("/api/v1/health/services")
        assert services.status_code == 401
        assert services.json()["error_code"] == "ECC_UNAUTHORIZED"

        allowed = client.get(
            "/api/v1/health/services", headers=_auth_headers()
        )
        assert allowed.status_code == 200


def test_registry_refresh_requires_mesh_token_when_configured(
    tmp_path: Path,
) -> None:
    app, _ = build_test_app(
        tmp_path,
        config=ServiceConfig(
            orchestration_root=str(tmp_path / "orchestration"),
            allow_demo_runner=True,
            require_auth=True,
            identity_api_base="http://identity.test",
            mesh_token="mesh-secret-token",
        ),
    )
    fake = FakeIdentityClient()
    app.state.container.register(
        "identity_client",
        lambda _c, client=fake: client,
    )
    with TestClient(app) as client:
        denied = client.post("/api/v1/registry/refresh")
        assert denied.status_code == 401
        ok = client.post(
            "/api/v1/registry/refresh",
            headers={"X-Empery-Mesh-Token": "mesh-secret-token"},
        )
        assert ok.status_code == 200


def test_register_and_login_still_exempt_when_require_auth(tmp_path: Path) -> None:
    fake = FakeIdentityClient()
    with _build_with_fake_identity(
        tmp_path, require_auth=True, identity=fake
    ) as client:
        register = client.post(
            "/api/v1/auth/register",
            json={
                "email": "guest@example.com",
                "password": "secretpass",
                "display_name": "Guest",
            },
        )
        assert register.status_code == 201

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "operator@example.com", "password": "secretpass"},
        )
        assert login.status_code == 200


def test_password_reset_paths_exempt_when_require_auth(tmp_path: Path) -> None:
    fake = FakeIdentityClient()
    with _build_with_fake_identity(
        tmp_path, require_auth=True, identity=fake
    ) as client:
        request = client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": "operator@example.com"},
        )
        assert request.status_code == 200
        assert request.json()["ok"] is True

        confirm = client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": "reset-token", "new_password": "newsecret1"},
        )
        assert confirm.status_code == 200
        assert confirm.json()["ok"] is True


def test_identity_roles_requires_bearer_when_require_auth(tmp_path: Path) -> None:
    with _client_require_auth(tmp_path) as client:
        denied = client.get("/api/v1/identity/roles")
        assert denied.status_code == 401
        assert denied.json()["error_code"] == "ECC_UNAUTHORIZED"


def test_sensitive_reads_allowed_without_auth_when_require_auth_false(
    tmp_path: Path,
) -> None:
    app, _ = build_test_app(
        tmp_path,
        config=ServiceConfig(
            orchestration_root=str(tmp_path / "orchestration"),
            allow_demo_runner=True,
            require_auth=False,
            identity_api_base="http://identity.test",
        ),
    )
    fake = FakeIdentityClient()
    app.state.container.register(
        "identity_client",
        lambda _c, client=fake: client,
    )
    with TestClient(app) as client:
        assert client.get("/api/v1/jobs").status_code == 200
        assert client.get("/api/v1/audit").status_code == 200
        assert client.get("/api/v1/registry").status_code == 200
