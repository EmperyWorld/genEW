"""Command gateway API tests."""

from pathlib import Path

from fastapi.testclient import TestClient

from services.empery_control_center_api.tests.conftest import (
    RecordingEventBus,
    build_test_app,
)


def test_create_command_and_convenience_routes(tmp_path: Path) -> None:
    bus = RecordingEventBus()
    app, _ = build_test_app(tmp_path, event_bus=bus)
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/commands",
            json={
                "skill": "plan",
                "intent": "Design notifications",
                "service_name": "notifications_service",
                "features": ["event_subscribe"],
            },
        )
        assert r.status_code == 201
        body = r.json()
        assert body["job"]["skill"] == "plan"
        assert body["job"]["status"] == "pending"
        assert body["job"]["agent_hint"] == "architect"
        assert "Preferred" in body["pickup_hint"]
        assert "Autonomous" in body["pickup_hint"]
        assert "Cursor" not in body["pickup_hint"]

        assert any(e.name == "ecc.job.created" for e in bus.published)

        for path, payload in [
            (
                "/api/v1/commands/plan",
                {
                    "intent": "Plan foo",
                    "service_name": "foo_service",
                },
            ),
            (
                "/api/v1/commands/implement",
                {"service_name": "foo_service"},
            ),
            (
                "/api/v1/commands/verify",
                {"service_name": "foo_service"},
            ),
            (
                "/api/v1/commands/evolve",
                {
                    "service_name": "foo_service",
                    "intent": "Evolve foo with bar",
                },
            ),
        ]:
            resp = client.post(path, json=payload)
            assert resp.status_code == 201, resp.text
            assert resp.json()["job"]["status"] == "pending"


def test_command_validation_error(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/commands",
            json={"skill": "plan", "intent": "", "service_name": "Bad-Name"},
        )
        assert r.status_code == 422
        assert r.json()["error_code"] == "ECC_VALIDATION_ERROR"
