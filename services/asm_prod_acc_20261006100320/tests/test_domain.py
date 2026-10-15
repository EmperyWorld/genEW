"""Domain API smoke for asm_prod_acc_20261006100320 ops dashboard."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.asm_prod_acc_20261006100320.config import ServiceConfig, clear_config_cache
from services.asm_prod_acc_20261006100320.src.api.main import create_app


def test_create_and_list_metrics(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    db_path = tmp_path / "domain_test.db"
    cfg = ServiceConfig(
        database_url=f"sqlite+pysqlite:///{db_path}",
        auto_create_tables=True,
    )
    with TestClient(create_app(config=cfg)) as client:
        created = client.post(
            "/api/v1/metrics",
            json={"label": "Latency", "value": "42", "unit": "ms"},
        )
        assert created.status_code == 201
        body = created.json()
        assert body["label"] == "Latency"
        listed = client.get("/api/v1/metrics")
        assert listed.status_code == 200
        assert listed.json()["count"] >= 1
        assert "metrics" in listed.json()
    clear_config_cache()
