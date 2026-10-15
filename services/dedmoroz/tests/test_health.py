"""Health smoke for dedmoroz."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.dedmoroz.config import ServiceConfig, clear_config_cache
from services.dedmoroz.src.api.main import create_app
from services.dedmoroz.src.integration.nervas_client import NervasClient


class _FakeNervas(NervasClient):
    def __init__(self) -> None:
        super().__init__("http://eic.test")

    async def health(self) -> dict:
        return {
            "status": "ok",
            "nervas": {"ready": True, "backend": "fake", "detail": "ok"},
        }

    async def chat(self, *, messages, temperature=0.55, max_tokens=1024) -> dict:
        last = messages[-1]["content"] if messages else ""
        return {"message": {"role": "assistant", "content": f"ho-ho: {last[:80]}"}}


def test_health_ok(monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    cfg = ServiceConfig(
        eic_api_base="http://eic.test",
        database_url="sqlite+pysqlite:///:memory:",
        auto_create_tables=True,
        cors_origins=["http://127.0.0.1:5175"],
        identity_mode="container",
        identity_base_url="http://identity.test",
    )
    app = create_app(config=cfg)
    app.state.container.register("nervas_client", lambda _c: _FakeNervas())
    with TestClient(app) as client:
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["service"] == "dedmoroz"
        assert body["nervas"]["ready"] is True
    clear_config_cache()
