"""Deterministic FakeAIProvider and analyze_task mapping tests."""

from __future__ import annotations

import asyncio
import json
import logging
from uuid import uuid4

from core.integration.ai_provider import AIChatMessage, AIChatRequest
from services.intelligence_service.src.core.contracts import TaskInsightRequest
from services.intelligence_service.src.integration.ai_insight import analyze_task
from tests.fakes.fake_ai import FakeAIProvider


def test_fake_complete_chat_deterministic() -> None:
    provider = FakeAIProvider(logging.getLogger("test_fake_ai"))
    request = AIChatRequest(
        messages=[
            AIChatMessage(role="system", content="Analyze tasks as JSON."),
            AIChatMessage(
                role="user",
                content=(
                    "Title: urgent production outage\n"
                    "Description: sev1 asap\n"
                    "Current priority: medium"
                ),
            ),
        ]
    )

    async def _run() -> None:
        first = await provider.complete_chat(request)
        second = await provider.complete_chat(request)
        assert first.provider == "fake_deterministic"
        first_data = json.loads(first.message.content)
        second_data = json.loads(second.message.content)
        assert first_data["suggested_priority"] == second_data["suggested_priority"] == "urgent"
        assert first_data["confidence"] == second_data["confidence"] == FakeAIProvider.CONFIDENCE
        assert first_data["summary"] == second_data["summary"]
        assert first_data["suggested_deadline"]
        assert second_data["suggested_deadline"]

    asyncio.run(_run())


def test_analyze_task_mapping_stable() -> None:
    provider = FakeAIProvider(logging.getLogger("test_fake_ai"))
    request = TaskInsightRequest(
        task_id=uuid4(),
        title="nice to have cleanup",
        description="someday maybe",
        current_priority="medium",
    )

    async def _run() -> None:
        result = await analyze_task(provider, request)
        assert result.suggested_priority == "low"
        assert result.confidence == FakeAIProvider.CONFIDENCE
        assert result.provider == "fake_deterministic"
        assert result.suggested_deadline is not None
        assert "Fake insight" in result.summary

    asyncio.run(_run())
