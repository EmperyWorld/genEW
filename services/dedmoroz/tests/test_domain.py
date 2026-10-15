"""Production-path domain smoke for dedmoroz (FakeNervas/FakeIdentity in tests only)."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from core.integration.identity_verifier import IdentityPrincipal
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
        last = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"),
            "",
        )
        return {"message": {"role": "assistant", "content": f"С Новым годом: {last}"}}


class _FakeIdentity:
    _user_id = uuid4()

    def verify_token(self, token: str) -> IdentityPrincipal:
        if token != "good-token":
            from core.errors import ServiceError, StandardizedErrorResponse

            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="DEDMOROZ_UNAUTHORIZED",
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


def _app(tmp_path):
    clear_config_cache()
    db_path = tmp_path / "dedmoroz_test.db"
    cfg = ServiceConfig(
        eic_api_base="http://eic.test",
        database_url=f"sqlite+pysqlite:///{db_path}",
        auto_create_tables=True,
        identity_mode="container",
        identity_base_url="http://identity.test",
    )
    app = create_app(config=cfg)
    app.state.container.register("nervas_client", lambda _c: _FakeNervas())
    app.state.container.register("identity_verifier", lambda _c: _FakeIdentity())
    return app


def test_anon_post_is_401(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    with TestClient(_app(tmp_path)) as client:
        res = client.post("/api/v1/messages", json={"content": "hi"})
        assert res.status_code == 401
    clear_config_cache()


def test_messages_roundtrip(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("EVENT_BUS_ALLOW_IN_MEMORY", "true")
    headers = {"Authorization": "Bearer good-token"}
    with TestClient(_app(tmp_path)) as client:
        empty = client.get("/api/v1/messages", headers=headers)
        assert empty.status_code == 200
        assert empty.json()["count"] == 0

        sent = client.post(
            "/api/v1/messages",
            json={"content": "Привет"},
            headers=headers,
        )
        assert sent.status_code == 201
        assert sent.json()["role"] == "user"

        listed = client.get("/api/v1/messages", headers=headers)
        assert listed.status_code == 200
        body = listed.json()
        assert body["count"] == 2
        assert body["messages"][0]["content"] == "Привет"
        assert "С Новым годом" in body["messages"][1]["content"]
    clear_config_cache()
