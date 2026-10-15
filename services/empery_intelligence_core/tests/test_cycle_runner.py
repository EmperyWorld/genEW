"""Headless Engine retired — 410 Gone on routes and engine entrypoints."""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from core.errors import ServiceError
from services.empery_intelligence_core.src.core.engine.contracts import (
    EngineCycleStartRequest,
    RoleName,
)
from services.empery_intelligence_core.tests.conftest import build_eic_app


def test_engine_start_cycle_gone(wired_container) -> None:
    engine = wired_container.resolve("headless_engine")

    async def _run() -> None:
        with pytest.raises(ServiceError) as exc:
            await engine.start_cycle(
                EngineCycleStartRequest(
                    intention_id="int-test-1",
                    roles=[
                        RoleName.ARCHITECT,
                        RoleName.IMPLEMENTER,
                        RoleName.VERIFIER,
                    ],
                )
            )
        assert exc.value.response.error_code == "EIC_ENGINE_GONE"
        assert exc.value.http_status == 410

    asyncio.run(_run())


def test_engine_get_status_gone(wired_container) -> None:
    engine = wired_container.resolve("headless_engine")
    with pytest.raises(ServiceError) as exc:
        engine.get_status("any-id")
    assert exc.value.response.error_code == "EIC_ENGINE_GONE"
    assert exc.value.http_status == 410


def test_engine_http_routes_410(tmp_path) -> None:
    app, _bus, _container = build_eic_app(tmp_path)
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/engine/cycles",
            json={"intention_id": "x"},
        )
        assert r.status_code == 410
        body = r.json()
        assert (
            body.get("error_code") == "EIC_ENGINE_GONE"
            or "ENGINE_GONE" in str(body)
        )

        r2 = client.get("/api/v1/engine/cycles/abc")
        assert r2.status_code == 410
