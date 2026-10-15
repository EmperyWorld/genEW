"""site_studio health + preview with mocked Nervas client."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from core.registry import register_all_services
from services.site_studio.config import ServiceConfig, clear_config_cache
from services.site_studio.src.api.main import create_app
from services.site_studio.src.integration.nervas_client import NervasClient


class _FakeNervas(NervasClient):
    def __init__(self) -> None:
        super().__init__("http://eic.test")

    async def health(self) -> dict[str, Any]:
        return {"nervas": {"ready": True, "detail": "HTTP 200", "backend": "local_llama"}}

    async def chat(
        self,
        *,
        messages: list[dict[str, str]],
        temperature: float = 0.35,
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        assert messages
        return {
            "backend": "local_llama",
            "model": "test-model",
            "message": {
                "role": "assistant",
                "content": (
                    "```html\n<!DOCTYPE html><html><head><title>Demo</title></head>"
                    "<body><h1>Hello Site</h1></body></html>\n```"
                ),
            },
        }


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    clear_config_cache()
    cfg = ServiceConfig(
        eic_api_base="http://eic.test",
        cors_origins=["http://127.0.0.1:5174"],
    )
    app = create_app(config=cfg)
    fake = _FakeNervas()
    app.state.container.register("nervas_client", lambda _c: fake)
    with TestClient(app) as c:
        yield c
    clear_config_cache()


def test_health_and_preview(client: TestClient) -> None:
    h = client.get("/api/v1/health")
    assert h.status_code == 200
    body = h.json()
    assert body["service"] == "site_studio"
    assert body["nervas"]["ready"] is True

    g = client.post(
        "/api/v1/preview",
        json={
            "title": "Aurora Cafe",
            "topic": "coffee shop",
            "brief": "Warm neighborhood cafe landing page",
            "language": "en",
        },
    )
    assert g.status_code == 200
    preview = g.json()
    assert preview["status"] == "ready"
    assert "<html" in preview["html"].lower()
    assert "Hello Site" in preview["html"]
    draft_id = preview["draft_id"]

    got = client.get(f"/api/v1/drafts/{draft_id}")
    assert got.status_code == 200
    html = client.get(f"/api/v1/drafts/{draft_id}/html")
    assert html.status_code == 200
    assert b"Hello Site" in html.content


def test_registered_in_global_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    registry = register_all_services()
    assert "site_studio" in registry.list_services()
