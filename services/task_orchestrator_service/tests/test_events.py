"""Lifecycle event publish tests."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from services.task_orchestrator_service.tests.conftest import (
    TEST_USER_ID,
    RecordingEventBus,
    auth_headers,
    build_test_app,
)


def test_create_update_assign_publish_expected_events() -> None:
    bus = RecordingEventBus()
    with TestClient(build_test_app(event_bus=bus)) as client:
        assignee = str(uuid4())
        created = client.post(
            "/api/v1/tasks",
            headers=auth_headers(),
            json={
                "title": "Eventful",
                "description": "desc",
                "assignee_id": assignee,
                "priority": "urgent",
            },
        )
        assert created.status_code == 201, created.text
        task = created.json()["task"]
        task_id = task["id"]

        assert len(bus.published) == 1
        created_event = bus.published[0]
        assert created_event.name == "task.created"
        assert created_event.source == "task_orchestrator_service"
        assert created_event.occurred_at is not None
        assert set(created_event.payload.keys()) == {
            "task_id",
            "title",
            "description",
            "assignee_id",
            "status",
            "priority",
            "created_by",
            "created_at",
        }
        assert created_event.payload["task_id"] == task_id
        assert created_event.payload["title"] == "Eventful"
        assert created_event.payload["description"] == "desc"
        assert created_event.payload["assignee_id"] == assignee
        assert created_event.payload["status"] == "backlog"
        assert created_event.payload["priority"] == "urgent"
        assert created_event.payload["created_by"] == str(TEST_USER_ID)

        updated = client.patch(
            f"/api/v1/tasks/{task_id}",
            headers=auth_headers(),
            json={"status": "todo", "title": "Eventful v2"},
        )
        assert updated.status_code == 200, updated.text
        assert len(bus.published) == 2
        updated_event = bus.published[1]
        assert updated_event.name == "task.updated"
        assert updated_event.source == "task_orchestrator_service"
        # title in changed_fields → content enrichment for intelligence re-analysis
        assert set(updated_event.payload.keys()) >= {
            "task_id",
            "changed_fields",
            "status",
            "updated_by",
            "updated_at",
            "title",
            "description",
            "priority",
        }
        assert updated_event.payload["task_id"] == task_id
        assert set(updated_event.payload["changed_fields"]) == {"status", "title"}
        assert updated_event.payload["status"] == "todo"
        assert updated_event.payload["title"] == "Eventful v2"
        assert updated_event.payload["description"] == "desc"
        assert updated_event.payload["priority"] == "urgent"
        assert updated_event.payload["updated_by"] == str(TEST_USER_ID)

        new_assignee = str(uuid4())
        assigned = client.post(
            f"/api/v1/tasks/{task_id}/assign",
            headers=auth_headers(),
            json={"assignee_id": new_assignee},
        )
        assert assigned.status_code == 200, assigned.text
        assert len(bus.published) == 3
        assigned_event = bus.published[2]
        assert assigned_event.name == "task.assigned"
        assert assigned_event.occurred_at is not None
        assert set(assigned_event.payload.keys()) == {
            "task_id",
            "assignee_id",
            "assigned_by",
            "assigned_at",
        }
        assert assigned_event.payload["task_id"] == task_id
        assert assigned_event.payload["assignee_id"] == new_assignee
        assert assigned_event.payload["assigned_by"] == str(TEST_USER_ID)


def test_rejected_write_publishes_no_events() -> None:
    bus = RecordingEventBus()
    with TestClient(build_test_app(event_bus=bus)) as client:
        response = client.post(
            "/api/v1/tasks",
            headers=auth_headers("invalid"),
            json={"title": "Nope"},
        )
        assert response.status_code == 401
        assert bus.published == []
