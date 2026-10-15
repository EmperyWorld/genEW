"""Health smoke for asm_prod_acc_20261006100320."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.asm_prod_acc_20261006100320.src.api.main import create_app


def test_health_ok() -> None:
    with TestClient(create_app()) as client:
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["service"] == "asm_prod_acc_20261006100320"
