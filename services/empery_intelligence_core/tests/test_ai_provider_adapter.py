"""AIProvider adapter round-trips via Nervas."""

from __future__ import annotations

import asyncio
from uuid import uuid4

from core.integration.ai_provider import (
    AIChatMessage,
    AIChatRequest,
    AIProfileRequest,
)
from services.empery_intelligence_core.src.integration.ai_provider_adapter import (
    NervasAIProviderAdapter,
)
from tests.fakes.fake_nervas import (
    FakeNervasProvider,
)


def test_complete_chat_and_profile() -> None:
    adapter = NervasAIProviderAdapter(FakeNervasProvider())

    async def _run() -> None:
        chat = await adapter.complete_chat(
            AIChatRequest(messages=[AIChatMessage(role="user", content="ping")])
        )
        assert chat.message.role == "assistant"
        assert chat.provider.startswith("nervas:")
        assert "FAKE_CHAT" in chat.message.content

        profile = await adapter.profile_user(
            AIProfileRequest(
                user_id=uuid4(),
                email="a@b.c",
                display_name="Ada",
            )
        )
        assert profile.summary
        assert 0.0 <= profile.confidence <= 1.0
        assert profile.provider.startswith("nervas:")

    asyncio.run(_run())
