"""Deterministic FakeNervasProvider for tests and CI."""

from __future__ import annotations

import logging

from core.integration.nervas import (
    NervasBackendHealth,
    NervasBackendId,
    NervasChatRequest,
    NervasChatResponse,
    NervasGenerateRequest,
    NervasGenerateResponse,
    NervasMessage,
    NervasPlanRequest,
    NervasPlanResponse,
    NervasPlanStep,
    NervasReasonRequest,
    NervasReasonResponse,
)
from core.logging import log_event


class FakeNervasProvider:
    """Always-ready Nervas backend with deterministic fixtures."""

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._logger = logger or logging.getLogger("empery_intelligence_core.fake_nervas")

    async def generate(self, request: NervasGenerateRequest) -> NervasGenerateResponse:
        log_event(
            self._logger,
            event="nervas.fake.generate",
            message="Fake generate",
            prompt_len=len(request.prompt),
        )
        content = f"FAKE_GENERATE: {request.prompt[:200]}"
        if "profile" in (request.system or "").lower() or "profil" in request.prompt.lower():
            content = (
                '{"summary":"Fake profile","traits":["deterministic"],'
                '"interests":["emery"],"confidence":0.9}'
            )
        return NervasGenerateResponse(
            content=content,
            backend=NervasBackendId.FAKE,
            model="fake-v1",
        )

    async def chat(self, request: NervasChatRequest) -> NervasChatResponse:
        last = request.messages[-1].content
        return NervasChatResponse(
            message=NervasMessage(
                role="assistant",
                content=f"FAKE_CHAT: {last[:200]}",
            ),
            backend=NervasBackendId.FAKE,
            model="fake-v1",
        )

    async def reason(self, request: NervasReasonRequest) -> NervasReasonResponse:
        q = request.question.lower()
        if "verify" in q or "passed" in q or "failed" in q:
            answer = (
                "Verification complete against design and implementation. PASSED"
            )
        elif "implement" in q or "file ops" in q or "json" in q:
            answer = (
                '{"summary":"Fake implementation proposal",'
                '"files":[{"path":".cursor/orchestration/reports/fake.md",'
                '"action":"write","content":"# fake\\n"}]}'
            )
        else:
            answer = f"FAKE_REASON: {request.question[:200]}"
        return NervasReasonResponse(
            answer=answer,
            reasoning_trace="fake-scratchpad",
            backend=NervasBackendId.FAKE,
            model="fake-v1",
        )

    async def plan(self, request: NervasPlanRequest) -> NervasPlanResponse:
        return NervasPlanResponse(
            summary=f"Fake plan for: {request.intention[:120]}",
            steps=[
                NervasPlanStep(
                    id="1",
                    title="Design",
                    role="architect",
                    acceptance="Design artifact written",
                ),
                NervasPlanStep(
                    id="2",
                    title="Implement",
                    role="implementer",
                    acceptance="Proposal written",
                    depends_on=["1"],
                ),
                NervasPlanStep(
                    id="3",
                    title="Verify",
                    role="verifier",
                    acceptance="Gate PASSED",
                    depends_on=["2"],
                ),
            ],
            backend=NervasBackendId.FAKE,
            model="fake-v1",
        )

    async def health(self) -> NervasBackendHealth:
        return NervasBackendHealth(
            backend=NervasBackendId.FAKE,
            ready=True,
            detail="FakeNervas always ready",
        )
