"""Production-path domain smoke for ai_chat (FakeNervas/FakeIdentity in tests only)."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from core.integration.identity_verifier import IdentityPrincipal
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

    async def chat(self, *, messages, temperature=0.45, max_tokens=1024) -> dict:
        last = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"),
            "",
        )
        return {
            "backend": "fake",
            "message": {"role": "assistant", "content": f"pong:{last}"},
        }


class _FakeIdentity:
    _user_id = uuid4()

    def verify_token(self, token: str) -> IdentityPrincipal:
        if token != "good-token":
            from core.errors import ServiceError, StandardizedErrorResponse

            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="AI_CHAT_UNAUTHORIZED",
                    message="bad token",
                ),
                http_status=401,
            )
        return IdentityPrincipal(
            user_id=self._user_id,
            email="tester@empery.local",
            roles=["user"],
            permissions=[],
        )


def _app():
    clear_config_cache()
    cfg = ServiceConfig(
        database_url="sqlite+pysqlite:///:memory:",
        auto_create_tables=True,
        eic_api_base="http://eic.test",
        identity_mode="container",
        identity_base_url="http://identity.test",
    )
    app = create_app(config=cfg)
    app.state.container.register("nervas_client", lambda _c: _FakeNervas())
    app.state.container.register("identity_verifier", lambda _c: _FakeIdentity())
    return app


def test_anon_post_is_401(monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    with TestClient(_app()) as client:
        res = client.post("/api/v1/messages", json={"content": "hi"})
        assert res.status_code == 401


def test_send_list_with_bearer(monkeypatch) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    headers = {"Authorization": "Bearer good-token"}
    with TestClient(_app()) as client:
        health = client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json()["nervas"]["ready"] is True

        created = client.post(
            "/api/v1/messages",
            json={"content": "Say only: pong"},
            headers=headers,
        )
        assert created.status_code == 201
        assert created.json()["role"] == "user"

        listed = client.get("/api/v1/messages", headers=headers)
        assert listed.status_code == 200
        body = listed.json()
        assert body["count"] == 2
        assistant = body["messages"][1]["content"]
        assert assistant.startswith("pong:")
        assert not assistant.lower().startswith("ack:")
