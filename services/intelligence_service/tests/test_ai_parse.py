"""AI insight parse reliability (Wave 2)."""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
import pytest

from core.errors import ServiceError
from core.integration.ai_provider import AIChatMessage, AIChatRequest, AIChatResponse
from services.intelligence_service.config import ServiceConfig
from services.intelligence_service.src.core.contracts import TaskInsightRequest
from services.intelligence_service.src.integration.ai_insight import (
    IntelligenceAIProvider,
    _parse_insight_content,
    analyze_task,
    strip_markdown_fences,
)


def test_strip_markdown_fences_json_block() -> None:
    raw = '```json\n{"suggested_priority":"high","summary":"ok","confidence":0.9}\n```'
    cleaned = strip_markdown_fences(raw)
    assert cleaned.startswith("{")
    parsed = _parse_insight_content(raw, "llama_cpp", "gemma")
    assert parsed.suggested_priority == "high"
    assert parsed.summary == "ok"
    assert parsed.confidence == 0.9
    assert parsed.raw["provider"] == "llama_cpp"
    assert parsed.raw["model"] == "gemma"


def test_strip_markdown_fences_plain_fence() -> None:
    raw = '```\n{"suggested_priority":"low","summary":"later","confidence":0.4}\n```'
    parsed = _parse_insight_content(raw, "remote_http", None)
    assert parsed.suggested_priority == "low"


@pytest.mark.asyncio
async def test_timeout_raises_intelligence_ai_error_when_fallback_off() -> None:
    cfg = ServiceConfig(
        database_url="sqlite+pysqlite:///:memory:",
        use_fake_ai=False,
        ai_fallback_to_fake=False,
        ai_allow_no_api_key=True,
        ai_chat_base_url="http://192.168.1.111:8080/v1/chat/completions",
        ai_chat_timeout_seconds=0.01,
        ai_chat_max_retries=0,
    )
    provider = IntelligenceAIProvider(cfg, logging.getLogger("test_ai_timeout"))

    async def _timeout(*_a, **_k):
        raise httpx.TimeoutException("timed out")

    with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=_timeout)):
        with pytest.raises(ServiceError) as exc_info:
            await provider.complete_chat(
                AIChatRequest(messages=[AIChatMessage(role="user", content="hi")])
            )
    assert exc_info.value.response.error_code == "INTELLIGENCE_AI_ERROR"
    assert exc_info.value.http_status == 502


@pytest.mark.asyncio
async def test_analyze_task_parses_fenced_json_from_provider() -> None:
    class _Stub:
        async def complete_chat(self, request: AIChatRequest) -> AIChatResponse:
            return AIChatResponse(
                message=AIChatMessage(
                    role="assistant",
                    content=(
                        '```json\n{"suggested_priority":"urgent",'
                        '"suggested_deadline":null,"summary":"Act now",'
                        '"confidence":0.95}\n```'
                    ),
                ),
                provider="llama_cpp",
                model="/models/gemma-4-26B.gguf",
            )

    result = await analyze_task(
        _Stub(),
        TaskInsightRequest(
            task_id=uuid4(),
            title="Ship",
            description="critical path",
        ),
    )
    assert result.suggested_priority == "urgent"
    assert result.summary == "Act now"
    assert result.provider == "llama_cpp"
