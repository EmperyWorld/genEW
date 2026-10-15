"""Health smoke for loshkovskiy."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.loshkovskiy.src.api.main import create_app


def test_health_ok() -> None:
    with TestClient(create_app()) as client:
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["service"] == "loshkovskiy"
