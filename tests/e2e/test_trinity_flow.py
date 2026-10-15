"""
E2E Empery Trinity flow: identity → task → intelligence.

Per-service containers share one EventBus (and identity_verifier on task).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from core.container import ServiceContainer
from core.event_bus import EventBus
from core.registry import GlobalServiceRegistry, register_all_services

REQUIRED_CORE = {
    "core_auth_service",
    "analytics_service",
    "identity_service",
    "task_orchestrator_service",
    "intelligence_service",
    "empery_intelligence_core",
    "empery_control_center_api",
}


@pytest.fixture(scope="module")
def trinity_bundle() -> Iterator[dict[str, Any]]:
    """Wire identity → intelligence → task with a shared EventBus."""
    registry = register_all_services()
    shared_bus = EventBus()

    from services.identity_service.config import ServiceConfig as IdentityConfig
    from services.identity_service.src.api.main import create_app as create_identity_app
    from services.intelligence_service.config import (
        ServiceConfig as IntelligenceConfig,
    )
    from services.intelligence_service.src.api.main import (
        create_app as create_intelligence_app,
    )
    from services.task_orchestrator_service.config import ServiceConfig as TaskConfig
    from services.task_orchestrator_service.src.api.main import (
        create_app as create_task_app,
    )

    identity_container = ServiceContainer()
    identity_container.register("event_bus", lambda _c: shared_bus)
    identity_cfg = IdentityConfig(
        database_url="sqlite+pysqlite:///:memory:",
        auto_create_tables=True,
        seed_demo_user=False,
    )
    identity_app = create_identity_app(
        container=identity_container, config=identity_cfg
    )

    intelligence_container = ServiceContainer()
    intelligence_container.register("event_bus", lambda _c: shared_bus)
    import logging

    from tests.fakes.fake_ai import FakeAIProvider

    intelligence_container.register(
        "ai_provider",
        lambda _c: FakeAIProvider(logging.getLogger("intelligence_fake_ai")),
    )
    intelligence_cfg = IntelligenceConfig(
        database_url="sqlite+pysqlite:///:memory:",
        auto_create_tables=True,
        use_fake_ai=False,
        subscribe_task_updated=False,
    )
    intelligence_app = create_intelligence_app(
        container=intelligence_container, config=intelligence_cfg
    )

    # identity_verifier must exist before task writes (container mode).
    verifier = identity_container.resolve("identity_verifier")
    task_container = ServiceContainer()
    task_container.register("event_bus", lambda _c: shared_bus)
    task_container.register("identity_verifier", lambda _c: verifier)
    task_cfg = TaskConfig(
        database_url="sqlite+pysqlite:///:memory:",
        auto_create_tables=True,
        identity_mode="container",
    )
    task_app = create_task_app(container=task_container, config=task_cfg)

    with (
        TestClient(identity_app) as identity_client,
        TestClient(intelligence_app) as intelligence_client,
        TestClient(task_app) as task_client,
    ):
        yield {
            "identity": identity_client,
            "task": task_client,
            "intelligence": intelligence_client,
            "registry": registry,
            "event_bus": shared_bus,
        }


def test_all_core_services_registered(trinity_bundle: dict[str, Any]) -> None:
    registry: GlobalServiceRegistry = trinity_bundle["registry"]
    names = set(registry.list_services())
    assert REQUIRED_CORE.issubset(names)
    assert len(names) >= len(REQUIRED_CORE)


def test_create_user_then_task_with_assignee(trinity_bundle: dict[str, Any]) -> None:
    identity: TestClient = trinity_bundle["identity"]
    task: TestClient = trinity_bundle["task"]

    email = f"trinity-{uuid.uuid4().hex[:10]}@example.com"
    password = "securepass123"
    register = identity.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "Trinity User",
        },
    )
    assert register.status_code in (200, 201), register.text
    user_id = register.json()["user"]["id"]

    login = identity.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    assert token

    create = task.post(
        "/api/v1/tasks",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Trinity E2E task",
            "description": "Created via identity-gated write",
            "assignee_id": str(user_id),
            "status": "todo",
            "priority": "medium",
        },
    )
    assert create.status_code == 201, create.text
    task_id = create.json()["task"]["id"]

    fetched = task.get(f"/api/v1/tasks/{task_id}")
    assert fetched.status_code == 200, fetched.text
    got = fetched.json()["task"]
    assert str(got["assignee_id"]) == str(user_id)
    assert str(got["created_by"]) == str(user_id)


def test_task_created_attaches_intelligence_insight(
    trinity_bundle: dict[str, Any],
) -> None:
    identity: TestClient = trinity_bundle["identity"]
    task: TestClient = trinity_bundle["task"]
    intelligence: TestClient = trinity_bundle["intelligence"]

    email = f"intel-{uuid.uuid4().hex[:10]}@example.com"
    password = "securepass123"
    register = identity.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "Intel User",
        },
    )
    assert register.status_code in (200, 201), register.text

    login = identity.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]

    create = task.post(
        "/api/v1/tasks",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "urgent: analyze this task for insights",
            "description": "Intelligence should attach an insight via FakeAI",
            "priority": "high",
        },
    )
    assert create.status_code == 201, create.text
    task_id = create.json()["task"]["id"]

    insight = intelligence.get(f"/api/v1/insights/{task_id}")
    assert insight.status_code == 200, insight.text
    insight_obj = insight.json()["insight"]
    assert str(insight_obj["task_id"]) == str(task_id)
    assert insight_obj.get("summary") or insight_obj.get("suggested_priority")


def test_invalid_jwt_rejected_on_task_create(trinity_bundle: dict[str, Any]) -> None:
    task: TestClient = trinity_bundle["task"]

    response = task.post(
        "/api/v1/tasks",
        headers={"Authorization": "Bearer not-a-valid-jwt"},
        json={"title": "Should not persist"},
    )
    assert response.status_code == 401, response.text
    body = response.json()
    assert "error_code" in body
    assert "message" in body

    listed = task.get("/api/v1/tasks")
    assert listed.status_code == 200, listed.text
    titles = [t["title"] for t in listed.json()["tasks"]]
    assert "Should not persist" not in titles
