"""Wave 2 Empery Standard error envelope tests."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from core.api.responses import new_error_response, register_standard_error_handlers
from core.errors import ServiceError, StandardizedErrorResponse


class _EchoBody(BaseModel):
    name: str = Field(min_length=1)


def _app() -> FastAPI:
    app = FastAPI()
    register_standard_error_handlers(
        app,
        service_prefix="IDENTITY",
        service_name="identity_service",
    )

    @app.get("/boom-service")
    async def boom_service() -> None:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="IDENTITY_INVALID_TOKEN",
                message="bad token",
            ),
            http_status=401,
        )

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("unexpected")

    @app.post("/echo")
    async def echo(payload: _EchoBody) -> dict:
        return payload.model_dump()

    return app


def test_service_error_includes_timestamp_and_service() -> None:
    with TestClient(_app(), raise_server_exceptions=False) as client:
        response = client.get("/boom-service")
    assert response.status_code == 401
    body = response.json()
    assert body["error_code"] == "IDENTITY_INVALID_TOKEN"
    assert body["timestamp"]
    assert body["request_id"]
    assert body["service"] == "identity_service"


def test_validation_error_includes_metadata() -> None:
    with TestClient(_app(), raise_server_exceptions=False) as client:
        response = client.post("/echo", json={"name": ""})
    assert response.status_code == 422
    body = response.json()
    assert body["error_code"] == "IDENTITY_VALIDATION_ERROR"
    assert body["timestamp"]
    assert body["service"] == "identity_service"


def test_unhandled_error_includes_metadata() -> None:
    with TestClient(_app(), raise_server_exceptions=False) as client:
        response = client.get("/boom")
    assert response.status_code == 500
    body = response.json()
    assert body["error_code"] == "IDENTITY_INTERNAL_ERROR"
    assert body["timestamp"]
    assert body["request_id"]
    assert body["service"] == "identity_service"


def test_request_id_from_header_propagated() -> None:
    with TestClient(_app(), raise_server_exceptions=False) as client:
        response = client.get(
            "/boom-service",
            headers={"X-Request-ID": "req-wave2-test"},
        )
    assert response.json()["request_id"] == "req-wave2-test"


def test_new_error_response_helper() -> None:
    err = new_error_response(
        error_code="TASK_NOT_FOUND",
        message="missing",
        service="task_orchestrator_service",
    )
    assert err.timestamp
    assert err.request_id
    assert err.service == "task_orchestrator_service"
