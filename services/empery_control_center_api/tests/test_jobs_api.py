"""Jobs CRUD / claim / cancel API tests (agent path only)."""

from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from services.empery_control_center_api.tests.conftest import build_test_app


def _create_job(client: TestClient, service: str = "agent_svc") -> str:
    r = client.post(
        "/api/v1/commands/plan",
        json={"intent": "Plan work", "service_name": service, "mode": "agent"},
    )
    assert r.status_code == 201, r.text
    return r.json()["job"]["id"]


def test_list_get_claim_patch_cancel(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        job_id = _create_job(client)
        listed = client.get("/api/v1/jobs")
        assert listed.status_code == 200
        assert listed.json()["count"] >= 1

        got = client.get(f"/api/v1/jobs/{job_id}")
        assert got.status_code == 200
        assert got.json()["job"]["id"] == job_id

        claimed = client.post(
            f"/api/v1/jobs/{job_id}/claim",
            json={"claimed_by": "test-agent"},
        )
        assert claimed.status_code == 200
        assert claimed.json()["job"]["status"] == "claimed"

        conflict = client.post(
            f"/api/v1/jobs/{job_id}/claim",
            json={"claimed_by": "other"},
        )
        assert conflict.status_code == 409
        assert conflict.json()["error_code"] == "ECC_INVALID_TRANSITION"

        patched = client.patch(
            f"/api/v1/jobs/{job_id}",
            json={"status": "running"},
        )
        assert patched.status_code == 200
        assert patched.json()["job"]["status"] == "running"

        cancelled = client.post(f"/api/v1/jobs/{job_id}/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["job"]["status"] == "cancelled"


def test_job_not_found(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        r = client.get(f"/api/v1/jobs/{uuid4()}")
        assert r.status_code == 404
        assert r.json()["error_code"] == "ECC_JOB_NOT_FOUND"


def test_run_demo_gone(tmp_path: Path) -> None:
    app, _ = build_test_app(tmp_path)
    with TestClient(app) as client:
        job_id = _create_job(client, service="stub_svc")
        r = client.post(f"/api/v1/jobs/{job_id}/run-demo")
        assert r.status_code == 404
