"""NervasRouter switches backends via runtime config without restart."""

from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from core.integration.nervas import NervasBackendId, NervasGenerateRequest
from services.empery_intelligence_core.src.core.nervas.use_cases import NervasUseCases
from services.empery_intelligence_core.src.data.provider_config_store import (
    NervasRuntimeConfigUpdate,
)


def test_router_switch_env_to_fake(wired_container) -> None:
    store = wired_container.resolve("provider_config_store")
    store.update(
        NervasRuntimeConfigUpdate(active_backend=NervasBackendId.LOCAL_LLAMA)
    )
    store.update(NervasRuntimeConfigUpdate(active_backend=NervasBackendId.FAKE))
    nervas = wired_container.resolve("nervas_provider")

    async def _run() -> None:
        assert nervas.active_backend_id() == NervasBackendId.FAKE
        resp = await nervas.generate(NervasGenerateRequest(prompt="switch-test"))
        assert resp.backend == NervasBackendId.FAKE

    asyncio.run(_run())


def test_put_config_switches_backend(wired_container) -> None:
    uc: NervasUseCases = wired_container.resolve("nervas_use_cases")

    async def _run() -> None:
        view = await uc.update_config(
            NervasRuntimeConfigUpdate(active_backend=NervasBackendId.FAKE)
        )
        assert view.active_backend == NervasBackendId.FAKE
        assert view.openai_configured is False
        resp = await uc.generate(NervasGenerateRequest(prompt="via-uc"))
        assert resp.backend == NervasBackendId.FAKE

    asyncio.run(_run())


def test_put_config_http(app) -> None:
    with TestClient(app) as client:
        r = client.put("/api/v1/nervas/config", json={"active_backend": "fake"})
        assert r.status_code == 200
        body = r.json()
        assert body["active_backend"] == "fake"
        assert "api_key" not in body
        assert "openai_api_key" not in str(body).lower()

        g = client.post("/api/v1/nervas/generate", json={"prompt": "hello"})
        assert g.status_code == 200
        assert g.json()["backend"] == "fake"
