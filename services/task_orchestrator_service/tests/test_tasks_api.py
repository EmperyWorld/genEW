"""API tests for Kanban task CRUD and assign flows."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from services.task_orchestrator_service.tests.conftest import (
    TEST_USER_ID,
    auth_headers,
    build_test_app,
)


def test_create_list_get_update_assign() -> None:
    with TestClient(build_test_app()) as client:
        assignee = str(uuid4())
        created = client.post(
            "/api/v1/tasks",
            headers=auth_headers(),
            json={
                "title": "Ship Trinity",
                "description": "Wire the brain",
                "status": "todo",
                "priority": "high",
                "assignee_id": assignee,
            },
        )
        assert created.status_code == 201, created.text
        body = created.json()["task"]
        assert body["title"] == "Ship Trinity"
        assert body["status"] == "todo"
        assert body["priority"] == "high"
        assert body["assignee_id"] == assignee
        assert body["created_by"] == str(TEST_USER_ID)
        task_id = body["id"]

        listed = client.get("/api/v1/tasks")
        assert listed.status_code == 200
        listed_body = listed.json()
        assert listed_body["count"] == 1
        assert listed_body["tasks"][0]["id"] == task_id

        filtered = client.get("/api/v1/tasks", params={"status": "todo"})
        assert filtered.status_code == 200
        assert filtered.json()["count"] == 1

        empty = client.get("/api/v1/tasks", params={"status": "done"})
        assert empty.status_code == 200
        assert empty.json()["count"] == 0

        fetched = client.get(f"/api/v1/tasks/{task_id}")
        assert fetched.status_code == 200
        assert fetched.json()["task"]["id"] == task_id

        updated = client.patch(
            f"/api/v1/tasks/{task_id}",
            headers=auth_headers(),
            json={"status": "in_progress", "title": "Ship Trinity now"},
        )
        assert updated.status_code == 200, updated.text
        updated_task = updated.json()["task"]
        assert updated_task["status"] == "in_progress"
        assert updated_task["title"] == "Ship Trinity now"
        assert updated_task["updated_by"] == str(TEST_USER_ID)

        new_assignee = str(uuid4())
        assigned = client.post(
            f"/api/v1/tasks/{task_id}/assign",
            headers=auth_headers(),
            json={"assignee_id": new_assignee},
        )
        assert assigned.status_code == 200, assigned.text
        assert assigned.json()["task"]["assignee_id"] == new_assignee


def test_create_validation_error() -> None:
    with TestClient(build_test_app()) as client:
        response = client.post(
            "/api/v1/tasks",
            headers=auth_headers(),
            json={"title": ""},
        )
        assert response.status_code == 422
        assert response.json()["error_code"] == "TASK_VALIDATION_ERROR"


def test_update_requires_at_least_one_field() -> None:
    with TestClient(build_test_app()) as client:
        created = client.post(
            "/api/v1/tasks",
            headers=auth_headers(),
            json={"title": "A"},
        )
        task_id = created.json()["task"]["id"]
        response = client.patch(
            f"/api/v1/tasks/{task_id}",
            headers=auth_headers(),
            json={},
        )
        assert response.status_code == 422
        assert response.json()["error_code"] == "TASK_VALIDATION_ERROR"


def test_get_unknown_task_404() -> None:
    with TestClient(build_test_app()) as client:
        response = client.get(
            f"/api/v1/tasks/{uuid4()}",
        )
        assert response.status_code == 404
        assert response.json()["error_code"] == "TASK_NOT_FOUND"
