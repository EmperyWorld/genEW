"""API tests for analytics event ingest, list, and aggregates."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.analytics_service.config import ServiceConfig
from services.analytics_service.src.api.main import create_app


def _app(**overrides):
    values = {
        "database_url": "sqlite+pysqlite:///:memory:",
        "auto_create_tables": True,
    }
    values.update(overrides)
    return create_app(config=ServiceConfig(**values))


def test_ingest_list_and_filter_events() -> None:
    with TestClient(_app()) as client:
        first = client.post(
            "/api/v1/events",
            json={
                "event_type": "page_view",
                "source": "web",
                "payload": {"path": "/home"},
            },
        )
        assert first.status_code == 201, first.text
        first_body = first.json()
        assert first_body["event"]["event_type"] == "page_view"
        assert first_body["event"]["source"] == "web"
        assert first_body["event"]["payload"]["path"] == "/home"
        assert first_body["event"]["id"]

        second = client.post(
            "/api/v1/events",
            json={"event_type": "click", "source": "web"},
        )
        assert second.status_code == 201, second.text

        listed = client.get("/api/v1/events")
        assert listed.status_code == 200
        body = listed.json()
        assert body["count"] == 2
        assert body["events"][0]["event_type"] == "click"
        assert body["events"][1]["event_type"] == "page_view"

        filtered = client.get("/api/v1/events", params={"event_type": "page_view"})
        assert filtered.status_code == 200
        filtered_body = filtered.json()
        assert filtered_body["count"] == 1
        assert filtered_body["events"][0]["event_type"] == "page_view"


def test_aggregates_by_type() -> None:
    with TestClient(_app()) as client:
        for event_type in ("page_view", "page_view", "click"):
            resp = client.post("/api/v1/events", json={"event_type": event_type})
            assert resp.status_code == 201, resp.text

        aggregates = client.get("/api/v1/events/aggregates/by-type")
        assert aggregates.status_code == 200
        body = aggregates.json()
        assert body["total_events"] == 3
        by_type = {item["event_type"]: item["count"] for item in body["items"]}
        assert by_type["page_view"] == 2
        assert by_type["click"] == 1
        assert body["items"][0]["count"] >= body["items"][-1]["count"]

        single = client.get(
            "/api/v1/events/aggregates/by-type",
            params={"event_type": "click"},
        )
        assert single.status_code == 200
        single_body = single.json()
        assert single_body["total_events"] == 1
        assert single_body["items"] == [{"event_type": "click", "count": 1}]


def test_ingest_validation_error() -> None:
    with TestClient(_app()) as client:
        response = client.post("/api/v1/events", json={"event_type": ""})
        assert response.status_code == 422
        body = response.json()
        assert body["error_code"] == "ANALYTICS_VALIDATION_ERROR"


def test_list_limit_validation() -> None:
    with TestClient(_app()) as client:
        response = client.get("/api/v1/events", params={"limit": 0})
        assert response.status_code == 422
        assert response.json()["error_code"] == "ANALYTICS_VALIDATION_ERROR"
