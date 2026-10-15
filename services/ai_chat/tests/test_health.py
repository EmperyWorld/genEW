"""Health smoke for ai_chat."""

from __future__ import annotations

from fastapi.testclient import TestClient

from services.ai_chat.config import ServiceConfig, clear_config_cache
from services.ai_chat.src.api.main import create_app
from services.ai_chat.src.integration.nervas_client import NervasClient


class _FakeNervas(NervasClient):
    def __init__(self) -> None:
        super().__init__("http://eic.test")

    async def health(self) -> dict:
        return {
            "status": "ok",
            "nervas": {"ready": True, "backend": "fake", "detail": "ok"},
        }


def test_health_includes_nervas(monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    cfg = ServiceConfig(
        database_url="sqlite+pysqlite:///:memory:",
        auto_create_tables=True,
        eic_api_base="http://eic.test",
    )
    app = create_app(config=cfg)
    app.state.container.register("nervas_client", lambda _c: _FakeNervas())
    with TestClient(app) as client:
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["service"] == "ai_chat"
        assert body["nervas"]["ready"] is True
    clear_config_cache()
