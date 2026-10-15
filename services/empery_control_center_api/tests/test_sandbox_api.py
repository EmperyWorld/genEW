"""Sandbox session + probe API tests."""

from pathlib import Path

from fastapi.testclient import TestClient

from core.registry import GlobalServiceRegistry
from services.empery_control_center_api.src.api.main import register
from services.empery_control_center_api.tests.conftest import build_test_app


def test_create_sandbox_session(tmp_path: Path) -> None:
    app, _bus = build_test_app(tmp_path)
    with TestClient(app) as client:
        r = client.post("/api/v1/sandbox/sessions", json={})
        assert r.status_code == 201
        body = r.json()
        assert body["status"] == "ready"
        assert body["session_id"]
        assert body["created_at"]


def test_sandbox_probe_publishes_events(tmp_path: Path) -> None:
    registry = GlobalServiceRegistry()
    register(registry)
    app, bus = build_test_app(tmp_path, registry=registry)
    with TestClient(app) as client:
        created = client.post("/api/v1/sandbox/sessions", json={})
        assert created.status_code == 201
        session_id = created.json()["session_id"]

        probe = client.post(
            f"/api/v1/sandbox/sessions/{session_id}/probe",
            json={
                "publisher": "empery_control_center_api",
                "subscriber": None,
                "topic": "task.created",
                "payload": {"task_id": "demo-1", "title": "probe"},
            },
        )
        assert probe.status_code == 200
        body = probe.json()
        assert body["accepted"] is True
        assert body["status"] == "accepted"
        assert body["session_id"] == session_id
        assert body["probe_id"]
        assert body["echo"]["topic"] == "task.created"

        names = [e.name for e in bus.published]
        assert "task.created" in names
        assert "sandbox.probe.result" in names


def test_sandbox_probe_unknown_session(tmp_path: Path) -> None:
    registry = GlobalServiceRegistry()
    register(registry)
    app, _bus = build_test_app(tmp_path, registry=registry)
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/sandbox/sessions/00000000-0000-0000-0000-000000000099/probe",
            json={
                "publisher": "empery_control_center_api",
                "topic": "task.created",
                "payload": {},
            },
        )
        assert r.status_code == 404
        assert r.json()["error_code"] == "ECC_SANDBOX_SESSION_NOT_FOUND"


def test_sandbox_probe_requires_confirm_for_destructive(tmp_path: Path) -> None:
    registry = GlobalServiceRegistry()
    register(registry)
    app, _bus = build_test_app(tmp_path, registry=registry)
    with TestClient(app) as client:
        session_id = client.post("/api/v1/sandbox/sessions", json={}).json()[
            "session_id"
        ]
        denied = client.post(
            f"/api/v1/sandbox/sessions/{session_id}/probe",
            json={
                "publisher": "empery_control_center_api",
                "topic": "identity.token.revoked",
                "payload": {"token_id": "x"},
                "confirm_destructive": False,
            },
        )
        assert denied.status_code == 400
        assert denied.json()["error_code"] == "ECC_SANDBOX_CONFIRM_REQUIRED"

        ok = client.post(
            f"/api/v1/sandbox/sessions/{session_id}/probe",
            json={
                "publisher": "empery_control_center_api",
                "topic": "identity.token.revoked",
                "payload": {"token_id": "x"},
                "confirm_destructive": True,
            },
        )
        assert ok.status_code == 200
        assert ok.json()["accepted"] is True
