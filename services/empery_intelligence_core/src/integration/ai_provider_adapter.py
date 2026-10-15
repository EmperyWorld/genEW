"""Bridge AIProvider (frozen) → NervasProvider."""

from __future__ import annotations

import json
import logging
import re

from core.integration.ai_provider import (
    AIChatMessage,
    AIChatRequest,
    AIChatResponse,
    AIProfileRequest,
    AIProfileResponse,
)
from core.integration.nervas import (
    NervasChatRequest,
    NervasGenerateRequest,
    NervasMessage,
    NervasProvider,
)
from core.logging import log_event

_PROFILE_SYSTEM = (
    "You profile Empery users. Reply with JSON only containing keys "
    "summary (str), traits (list[str]), interests (list[str]), "
    "confidence (float 0..1)."
)


class NervasAIProviderAdapter:
    """
    Legacy ``AIProvider`` fulfillment via Nervas.

    ``complete_chat`` → ``nervas.chat``;
    ``profile_user`` → ``nervas.generate`` with a fixed profiling system prompt.
    """

    def __init__(
        self,
        nervas: NervasProvider,
        logger: logging.Logger | None = None,
    ) -> None:
        self._nervas = nervas
        self._logger = logger or logging.getLogger(
            "empery_intelligence_core.ai_provider_adapter"
        )

    async def complete_chat(self, request: AIChatRequest) -> AIChatResponse:
        nervas_req = NervasChatRequest(
            messages=[
                NervasMessage(role=m.role, content=m.content)  # type: ignore[arg-type]
                for m in request.messages
            ],
            metadata=dict(request.metadata),
        )
        resp = await self._nervas.chat(nervas_req)
        log_event(
            self._logger,
            event="ai_provider.adapter.chat",
            message="AIProvider complete_chat via Nervas",
            backend=resp.backend.value,
        )
        return AIChatResponse(
            message=AIChatMessage(
                role=resp.message.role,
                content=resp.message.content,
            ),
            provider=f"nervas:{resp.backend.value}",
            model=resp.model,
        )

    async def profile_user(self, request: AIProfileRequest) -> AIProfileResponse:
        prompt = (
            f"Profile user_id={request.user_id} email={request.email} "
            f"display_name={request.display_name} metadata={request.metadata}"
        )
        resp = await self._nervas.generate(
            NervasGenerateRequest(prompt=prompt, system=_PROFILE_SYSTEM)
        )
        summary, traits, interests, confidence = self._parse_profile(
            resp.content, request.display_name
        )
        return AIProfileResponse(
            summary=summary,
            traits=traits,
            interests=interests,
            confidence=confidence,
            provider=f"nervas:{resp.backend.value}",
            raw={"content": resp.content, "user_id": str(request.user_id)},
        )

    @staticmethod
    def _parse_profile(
        content: str, display_name: str
    ) -> tuple[str, list[str], list[str], float]:
        try:
            match = re.search(r"\{[\s\S]*\}", content)
            raw = json.loads(match.group(0) if match else content)
            summary = str(raw.get("summary") or f"Profile for {display_name}")
            traits = [str(t) for t in (raw.get("traits") or [])]
            interests = [str(i) for i in (raw.get("interests") or [])]
            confidence = float(raw.get("confidence", 0.7))
            confidence = max(0.0, min(1.0, confidence))
            return summary, traits, interests, confidence
        except (json.JSONDecodeError, TypeError, ValueError):
            return f"Profile for {display_name}", [], [], 0.5
