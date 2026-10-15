"""Nervas outage must pause Hands jobs, not archive them as failed."""

from __future__ import annotations

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_intelligence_core.src.core.reflexes.agent_loop import (
    _is_retryable_nervas_error,
)


def test_llama_unreachable_is_retryable() -> None:
    exc = ServiceError(
        StandardizedErrorResponse(
            error_code="NERVAS_BACKEND_UNAVAILABLE",
            message="Local llama.cpp backend unreachable",
            details={"base_url": "http://192.168.1.111:8080", "reason": "ReadTimeout"},
        ),
        http_status=503,
    )
    assert _is_retryable_nervas_error(exc) is True


def test_nervas_unavailable_message_is_retryable() -> None:
    exc = ServiceError(
        StandardizedErrorResponse(
            error_code="EIC_LOOP_ERROR",
            message="nervas_unavailable",
            details={"reason": "no reason/chat/generate methods"},
        ),
        http_status=503,
    )
    assert _is_retryable_nervas_error(exc) is True


def test_unrelated_service_error_is_not_retryable() -> None:
    exc = ServiceError(
        StandardizedErrorResponse(
            error_code="EIC_SANDBOX_DENIED",
            message="Path denied by sandbox policy",
            details={"path": "secrets.env"},
        ),
        http_status=403,
    )
    assert _is_retryable_nervas_error(exc) is False
