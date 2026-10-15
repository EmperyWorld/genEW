"""Deterministic FakeAIProvider for tests and CI."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from core.integration.ai_provider import (
    AIChatMessage,
    AIChatRequest,
    AIChatResponse,
    AIProfileRequest,
    AIProfileResponse,
)
from core.logging import log_event


class FakeAIProvider:
    """
    Deterministic AIProvider used when ``use_fake_ai=true``.

    Priority is derived from title keywords / length; deadline is now+N days;
    confidence is fixed at 0.85 for stable assertions.
    """

    CONFIDENCE = 0.85

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._logger = logger or logging.getLogger("intelligence_service.fake_ai")

    async def complete_chat(self, request: AIChatRequest) -> AIChatResponse:
        title, description, current_priority = self._extract_task_fields(request)
        priority = self._suggest_priority(title, description, current_priority)
        days = {"low": 14, "medium": 7, "high": 3, "urgent": 1, "critical": 1}.get(
            priority, 7
        )
        deadline = datetime.now(timezone.utc) + timedelta(days=days)
        summary = (
            f"Fake insight for '{title[:80]}': "
            f"suggested {priority} priority within {days} day(s)."
        )
        payload = {
            "suggested_priority": priority,
            "suggested_deadline": deadline.isoformat(),
            "summary": summary,
            "confidence": self.CONFIDENCE,
        }
        content = json.dumps(payload)
        log_event(
            self._logger,
            event="ai_provider.chat.fake",
            message="Fake AI chat completion finished",
            suggested_priority=priority,
            confidence=self.CONFIDENCE,
        )
        return AIChatResponse(
            message=AIChatMessage(role="assistant", content=content),
            provider="fake_deterministic",
            model="fake-v1",
        )

    async def profile_user(self, request: AIProfileRequest) -> AIProfileResponse:
        return AIProfileResponse(
            summary=f"Fake profile for {request.display_name}",
            traits=["deterministic"],
            interests=["tasks"],
            confidence=self.CONFIDENCE,
            provider="fake_deterministic",
            raw={"user_id": str(request.user_id)},
        )

    @staticmethod
    def _extract_task_fields(request: AIChatRequest) -> tuple[str, str, str | None]:
        user = next(
            (m for m in reversed(request.messages) if m.role == "user"),
            request.messages[-1],
        )
        text = user.content
        title_match = re.search(r"Title:\s*(.+)", text)
        desc_match = re.search(r"Description:\s*(.*?)(?:\nCurrent priority:|\Z)", text, re.S)
        prio_match = re.search(r"Current priority:\s*(.+)", text)
        title = title_match.group(1).strip() if title_match else text[:120]
        description = desc_match.group(1).strip() if desc_match else ""
        current = prio_match.group(1).strip() if prio_match else None
        if current in {"None", "none", ""}:
            current = None
        return title, description, current

    @staticmethod
    def _suggest_priority(
        title: str,
        description: str,
        current_priority: str | None,
    ) -> str:
        blob = f"{title} {description}".lower()
        if any(k in blob for k in ("urgent", "asap", "critical", "sev1", "p0")):
            return "urgent"
        if any(k in blob for k in ("important", "blocker", "high")):
            return "high"
        if any(k in blob for k in ("nice to have", "someday", "low")):
            return "low"
        if current_priority in {"low", "medium", "high", "urgent", "critical"}:
            return current_priority
        if len(title) > 60:
            return "high"
        if len(title) < 12:
            return "low"
        return "medium"
