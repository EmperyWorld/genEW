"""Empery Standard API error envelope helpers."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from core.errors import ServiceError, StandardizedErrorResponse
from core.logging import log_event


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _request_id(request: Request | None) -> str:
    if request is None:
        return str(uuid.uuid4())
    header = request.headers.get("X-Request-ID") or request.headers.get("x-request-id")
    if header and header.strip():
        return header.strip()
    return str(uuid.uuid4())


def new_error_response(
    *,
    error_code: str,
    message: str,
    details: dict[str, Any] | None = None,
    service: str | None = None,
    request_id: str | None = None,
    timestamp: str | None = None,
) -> StandardizedErrorResponse:
    """Build a StandardizedErrorResponse with Wave 2 metadata filled in."""
    return StandardizedErrorResponse(
        error_code=error_code,
        message=message,
        details=dict(details or {}),
        timestamp=timestamp or _utc_now_iso(),
        request_id=request_id or str(uuid.uuid4()),
        service=service,
    )


def empery_metadata(
    *,
    service: str | None = None,
    request_id: str | None = None,
) -> dict[str, str | None]:
    """Optional success-path metadata for routes that opt in (non-breaking)."""
    return {
        "timestamp": _utc_now_iso(),
        "service": service,
        "request_id": request_id or str(uuid.uuid4()),
    }


def _enrich_error(
    response: StandardizedErrorResponse,
    *,
    service_name: str,
    request: Request,
) -> StandardizedErrorResponse:
    updates: dict[str, Any] = {}
    if not response.timestamp:
        updates["timestamp"] = _utc_now_iso()
    if not response.request_id:
        updates["request_id"] = _request_id(request)
    if not response.service:
        updates["service"] = service_name
    if not updates:
        return response
    return response.model_copy(update=updates)


def _serializable_validation_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    serializable: list[dict[str, Any]] = []
    for item in exc.errors():
        cleaned = dict(item)
        ctx = cleaned.get("ctx")
        if isinstance(ctx, dict):
            cleaned["ctx"] = {key: str(value) for key, value in ctx.items()}
        serializable.append(cleaned)
    return serializable


def register_standard_error_handlers(
    app: FastAPI,
    *,
    service_prefix: str,
    service_name: str,
    validation_error_code: str | None = None,
    internal_error_code: str | None = None,
) -> None:
    """
    Register Empery Standard boundary error handlers on ``app``.

    Preserves existing ``{PREFIX}_VALIDATION_ERROR`` / ``{PREFIX}_INTERNAL_ERROR``
    naming. Pass explicit codes when a service historically used a different
    validation prefix (e.g. EIC → ``NERVAS_VALIDATION_ERROR``).
    """
    validation_code = validation_error_code or f"{service_prefix}_VALIDATION_ERROR"
    internal_code = internal_error_code or f"{service_prefix}_INTERNAL_ERROR"
    log_prefix = service_prefix.lower()

    @app.exception_handler(ServiceError)
    async def service_error_handler(
        request: Request,
        exc: ServiceError,
    ) -> JSONResponse:
        body = _enrich_error(
            exc.response,
            service_name=service_name,
            request=request,
        )
        container = getattr(request.app.state, "container", None)
        if container is not None and container.has("logger"):
            log_event(
                container.resolve("logger"),
                event=f"{log_prefix}.service_error",
                message=body.message,
                level=logging.WARNING,
                error_code=body.error_code,
                path=str(request.url.path),
                request_id=body.request_id,
            )
        return JSONResponse(
            status_code=exc.http_status,
            content=body.model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        error = new_error_response(
            error_code=validation_code,
            message="Request validation failed",
            details={"errors": _serializable_validation_errors(exc)},
            service=service_name,
            request_id=_request_id(request),
        )
        return JSONResponse(status_code=422, content=error.model_dump())

    @app.exception_handler(Exception)
    async def unhandled_error_handler(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        error = new_error_response(
            error_code=internal_code,
            message="Unexpected service error",
            details={"reason": str(exc)},
            service=service_name,
            request_id=_request_id(request),
        )
        container = getattr(request.app.state, "container", None)
        if container is not None and container.has("logger"):
            log_event(
                container.resolve("logger"),
                event=f"{log_prefix}.unhandled_error",
                message=error.message,
                level=logging.ERROR,
                error_code=error.error_code,
                path=str(request.url.path),
                request_id=error.request_id,
            )
        return JSONResponse(status_code=500, content=error.model_dump())
