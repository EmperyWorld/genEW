"""Identity write-gate tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.task_orchestrator_service.tests.conftest import (
    auth_headers,
    build_test_app,
)


def test_missing_bearer_returns_401() -> None:
    with TestClient(build_test_app()) as client:
        response = client.post(
            "/api/v1/tasks",
            json={"title": "No auth"},
        )
        assert response.status_code == 401
        assert response.json()["error_code"] == "TASK_UNAUTHORIZED"

        listed = client.get("/api/v1/tasks")
        assert listed.status_code == 200
        assert listed.json()["count"] == 0


def test_invalid_token_returns_401_and_no_mutation() -> None:
    with TestClient(build_test_app()) as client:
        response = client.post(
            "/api/v1/tasks",
            headers=auth_headers("bad-token"),
            json={"title": "Should not persist"},
        )
        assert response.status_code == 401
        assert response.json()["error_code"] == "TASK_UNAUTHORIZED"

        listed = client.get("/api/v1/tasks")
        assert listed.status_code == 200
        assert listed.json()["count"] == 0


def test_malformed_authorization_returns_401() -> None:
    with TestClient(build_test_app()) as client:
        response = client.post(
            "/api/v1/tasks",
            headers={"Authorization": "Token abc"},
            json={"title": "Bad header"},
        )
        assert response.status_code == 401
        assert response.json()["error_code"] == "TASK_UNAUTHORIZED"


def test_update_and_assign_require_auth() -> None:
    with TestClient(build_test_app()) as client:
        created = client.post(
            "/api/v1/tasks",
            headers=auth_headers(),
            json={"title": "Protected"},
        )
        task_id = created.json()["task"]["id"]

        update = client.patch(
            f"/api/v1/tasks/{task_id}",
            json={"status": "done"},
        )
        assert update.status_code == 401
        assert update.json()["error_code"] == "TASK_UNAUTHORIZED"

        assign = client.post(
            f"/api/v1/tasks/{task_id}/assign",
            json={"assignee_id": "22222222-2222-2222-2222-222222222222"},
        )
        assert assign.status_code == 401
        assert assign.json()["error_code"] == "TASK_UNAUTHORIZED"
