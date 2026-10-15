"""Autonomous gateway API: intentions, jobs, mode controls."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from core.container import ServiceContainer
from core.logging import configure_logging
from services.empery_control_center_api.src.api.main import create_app
from services.empery_control_center_api.tests.conftest import (
    RecordingEventBus,
    make_config,
)
from services.empery_intelligence_core.config import ServiceConfig as EicConfig
from services.empery_intelligence_core.src.api.wire_autonomous import wire_autonomous


def _build_ecc_with_eic(tmp_path: Path):
    container = ServiceContainer()
    bus = RecordingEventBus()
    container.register("event_bus", lambda _c: bus)
    container.register(
        "logger", lambda _c: configure_logging("ecc_autonomous_test")
    )
    eic_cfg = EicConfig(
        provider_id="fake",
        autonomous_enabled=True,
        use_fake_nervas=True,
        allow_autonomous_fakes=True,
        require_deploy_agent=False,
        auto_deploy_on_implement=False,
        worker_enabled=False,
        provider_runtime_path=str(tmp_path / "provider_runtime.json"),
        provider_config_path=str(tmp_path / "nervas_runtime.json"),
        orchestration_root=str(tmp_path / "orchestration"),
        workspace_root=str(tmp_path),
    )
    container.register("config", lambda _c: eic_cfg)
    container.register("eic_config", lambda _c: eic_cfg)
    wire_autonomous(container, eic_cfg)
    ecc_cfg = make_config(tmp_path)
    app = create_app(container=container, config=ecc_cfg)
    return app, bus


def test_intention_jobs_mode_lifecycle(tmp_path: Path) -> None:
    app, bus = _build_ecc_with_eic(tmp_path)
    with TestClient(app) as client:
        mode_off = client.get("/api/v1/autonomous/mode")
        assert mode_off.status_code == 200
        assert mode_off.json()["enabled"] is True

        r = client.put("/api/v1/autonomous/mode", json={"enabled": False})
        assert r.status_code == 200
        assert r.json()["enabled"] is False

        blocked = client.post(
            "/api/v1/autonomous/intentions",
            json={"intention": "Should fail while mode off"},
        )
        assert blocked.status_code == 409
        assert blocked.json()["error_code"] == "EIC_MODE_DISABLED"

        r = client.put("/api/v1/autonomous/mode", json={"enabled": True})
        assert r.status_code == 200

        created = client.post(
            "/api/v1/autonomous/intentions",
            json={
                "intention": "Implement autonomous panel",
                "service_name": "demo_service",
                "priority": 10,
            },
        )
        assert created.status_code == 201
        body = created.json()
        job_id = body["job"]["id"]
        assert body["job"]["status"] == "queued"
        assert body["intention"]["text"] == "Implement autonomous panel"

        listed = client.get("/api/v1/autonomous/jobs")
        assert listed.status_code == 200
        assert listed.json()["total"] >= 1

        got = client.get(f"/api/v1/autonomous/jobs/{job_id}")
        assert got.status_code == 200
        assert got.json()["job"]["id"] == job_id

        paused = client.post(f"/api/v1/autonomous/jobs/{job_id}/pause")
        assert paused.status_code == 200
        assert paused.json()["job"]["status"] == "paused"

        resumed = client.post(f"/api/v1/autonomous/jobs/{job_id}/resume")
        assert resumed.status_code == 200
        assert resumed.json()["job"]["status"] == "queued"

        cancelled = client.post(f"/api/v1/autonomous/jobs/{job_id}/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["job"]["status"] == "cancelled"

        bad = client.post(f"/api/v1/autonomous/jobs/{job_id}/pause")
        assert bad.status_code == 409
        assert bad.json()["error_code"] == "EIC_INVALID_TRANSITION"

        missing = client.get(f"/api/v1/autonomous/jobs/{uuid4()}")
        assert missing.status_code == 404
        assert missing.json()["error_code"] == "EIC_JOB_NOT_FOUND"

        event_names = {e.name for e in bus.published}
        assert "eic.intention.submitted" in event_names
        assert "eic.job.queued" in event_names
        assert "eic.mode.changed" in event_names


def test_memory_search(tmp_path: Path) -> None:
    app, _ = _build_ecc_with_eic(tmp_path)
    with TestClient(app) as client:
        r = client.get(
            "/api/v1/autonomous/memory/search",
            params={"q": "architecture", "limit": 5},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["query"] == "architecture"
        assert len(body["hits"]) >= 1


def test_autonomous_gateway_unavailable(tmp_path: Path) -> None:
    """No EIC providers → ECC_EIC_UNAVAILABLE."""
    from services.empery_control_center_api.tests.conftest import build_test_app

    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        r = client.get("/api/v1/autonomous/mode")
        assert r.status_code == 503
        assert r.json()["error_code"] == "ECC_EIC_UNAVAILABLE"


def test_cors_on_autonomous_success_and_503(tmp_path: Path) -> None:
    """Browser Origin must receive CORS headers on 200 and 503."""
    origin = "http://localhost:5173"
    app, _ = _build_ecc_with_eic(tmp_path)
    with TestClient(app) as client:
        ok = client.get(
            "/api/v1/autonomous/mode",
            headers={"Origin": origin},
        )
        assert ok.status_code == 200
        assert ok.headers.get("access-control-allow-origin") == origin

    from services.empery_control_center_api.tests.conftest import build_test_app

    unavailable, _ = build_test_app(tmp_path)
    with TestClient(unavailable) as client:
        err = client.get(
            "/api/v1/autonomous/mode",
            headers={"Origin": origin},
        )
        assert err.status_code == 503
        assert err.headers.get("access-control-allow-origin") == origin
        preflight = client.options(
            "/api/v1/autonomous/mode",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        assert preflight.status_code in {200, 204}
        assert preflight.headers.get("access-control-allow-origin") == origin
