"""Pydantic V2 Nervas contracts + FakeNervas Protocol compliance."""

from __future__ import annotations

import asyncio

import pytest
from pydantic import ValidationError

from core.integration.nervas import (
    NervasBackendId,
    NervasChatRequest,
    NervasGenerateRequest,
    NervasMessage,
    NervasPlanRequest,
    NervasPlanStep,
    NervasReasonRequest,
)
from tests.fakes.fake_nervas import (
    FakeNervasProvider,
)


def test_generate_request_requires_prompt() -> None:
    with pytest.raises(ValidationError):
        NervasGenerateRequest(prompt="")


def test_chat_request_requires_messages() -> None:
    with pytest.raises(ValidationError):
        NervasChatRequest(messages=[])


def test_plan_step_frozen() -> None:
    step = NervasPlanStep(id="1", title="t", role="architect")
    with pytest.raises((ValidationError, TypeError)):
        step.title = "x"  # type: ignore[misc]


def test_fake_nervas_implements_protocol() -> None:
    fake = FakeNervasProvider()

    async def _run() -> None:
        gen = await fake.generate(NervasGenerateRequest(prompt="hello"))
        assert gen.backend == NervasBackendId.FAKE
        assert "FAKE_GENERATE" in gen.content

        chat = await fake.chat(
            NervasChatRequest(messages=[NervasMessage(role="user", content="hi")])
        )
        assert chat.message.role == "assistant"

        reason = await fake.reason(NervasReasonRequest(question="why?"))
        assert reason.answer

        plan = await fake.plan(NervasPlanRequest(intention="ship it"))
        assert len(plan.steps) >= 1

        health = await fake.health()
        assert health.ready is True

    asyncio.run(_run())
