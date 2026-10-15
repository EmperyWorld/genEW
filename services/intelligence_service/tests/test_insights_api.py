"""API tests for insight analyze and lookup."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from services.intelligence_service.tests.conftest import build_intelligence_app


def _app(**overrides):
    return build_intelligence_app(**overrides)


def test_analyze_and_get_insight() -> None:
    task_id = str(uuid4())
    with TestClient(_app()) as client:
        created = client.post(
            "/api/v1/insights/analyze",
            json={
                "task_id": task_id,
                "title": "Ship urgent release blocker",
                "description": "Needs ASAP attention",
                "priority": "medium",
            },
        )
        assert created.status_code == 201, created.text
        body = created.json()
        insight = body["insight"]
        assert insight["task_id"] == task_id
        assert insight["suggested_priority"] == "urgent"
        assert insight["confidence"] == 0.85
        assert insight["source"] == "manual"
        assert insight["summary"]

        fetched = client.get(f"/api/v1/insights/{task_id}")
        assert fetched.status_code == 200
        assert fetched.json()["insight"]["id"] == insight["id"]
        assert fetched.json()["insight"]["suggested_priority"] == "urgent"


def test_get_insight_not_found() -> None:
    missing = str(uuid4())
    with TestClient(_app()) as client:
        response = client.get(f"/api/v1/insights/{missing}")
        assert response.status_code == 404
        body = response.json()
        assert body["error_code"] == "INTELLIGENCE_NOT_FOUND"


def test_analyze_validation_error() -> None:
    with TestClient(_app()) as client:
        response = client.post(
            "/api/v1/insights/analyze",
            json={"task_id": str(uuid4()), "title": ""},
        )
        assert response.status_code == 422
        assert response.json()["error_code"] == "INTELLIGENCE_VALIDATION_ERROR"
