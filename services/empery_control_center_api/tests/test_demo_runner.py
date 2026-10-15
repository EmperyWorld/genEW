"""Demo runner removed — production path is agent-only."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from services.empery_control_center_api.tests.conftest import build_test_app


def test_run_demo_endpoint_removed(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/commands/plan",
            json={
                "intent": "Plan something",
                "service_name": "agent_only_svc",
                "mode": "agent",
            },
        )
        assert created.status_code == 201, created.text
        job_id = created.json()["job"]["id"]
        ran = client.post(f"/api/v1/jobs/{job_id}/run-demo")
        assert ran.status_code == 404


def test_enqueue_rejects_mode_demo(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/commands/plan",
            json={
                "intent": "Plan demo",
                "service_name": "no_demo_svc",
                "mode": "demo",
            },
        )
        assert r.status_code == 422
        body = r.json()
        assert body.get("error_code") == "ECC_DEMO_MODE_REMOVED"
