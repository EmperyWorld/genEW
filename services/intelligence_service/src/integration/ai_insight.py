"""Concrete AIProvider implementation for intelligence_service."""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.ai_provider import (
    AIChatMessage,
    AIChatRequest,
    AIChatResponse,
    AIProfileRequest,
    AIProfileResponse,
)
from core.logging import log_event
from services.intelligence_service.config import ServiceConfig
from services.intelligence_service.src.core.contracts import (
    TaskInsightRequest,
    TaskInsightResponse,
)
_FENCE_RE = re.compile(
    r"^\s*```(?:json)?\s*\n?(.*?)\n?\s*```\s*$",
    re.DOTALL | re.IGNORECASE,
)


def strip_markdown_fences(content: str) -> str:
    """Remove surrounding ``` / ```json fences when the whole body is fenced."""
    text = content.strip()
    match = _FENCE_RE.match(text)
    if match:
        return match.group(1).strip()
    # Partial fence: leading ```json ... trailing ```
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return text


class IntelligenceAIProvider:
    """
    AIProvider fulfillment for task-insight workflows.

    Prefers the configured OpenAI-compatible endpoint (llama.cpp / Nervas local).
    FakeAI fallback is removed from production modules — tests use tests/fakes only.
    """

    def __init__(self, config: ServiceConfig, logger: logging.Logger) -> None:
        self._config = config
        self._logger = logger
        if getattr(config, "ai_fallback_to_fake", False):
            log_event(
                self._logger,
                event="ai_provider.fake_fallback_ignored",
                message=(
                    "AI_CHAT_FALLBACK_FAKE is ignored — FakeAI is tests-only "
                    "(tests/fakes); remote failure fails closed"
                ),
                level=logging.WARNING,
            )

    def _should_call_remote(self) -> bool:
        if self._config.ai_chat_api_key:
            return True
        return self._config.ai_allow_no_api_key and bool(
            self._config.ai_chat_base_url.strip()
        )

    async def complete_chat(self, request: AIChatRequest) -> AIChatResponse:
        if not request.messages:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="INTELLIGENCE_AI_ERROR",
                    message="At least one chat message is required",
                ),
                http_status=502,
            )

        if self._should_call_remote():
            try:
                return await self._remote_chat(request)
            except ServiceError:
                raise
            except Exception as exc:  # noqa: BLE001 — boundary maps to StandardizedError
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="INTELLIGENCE_AI_ERROR",
                        message="Remote AI chat provider failed",
                        details={"reason": str(exc)},
                    ),
                    http_status=502,
                ) from exc

        raise ServiceError(
            StandardizedErrorResponse(
                error_code="INTELLIGENCE_AI_ERROR",
                message=(
                    "Remote AI chat is not configured "
                    "(set AI_CHAT_BASE_URL / API key; FakeAI is tests-only)"
                ),
            ),
            http_status=502,
        )

    async def profile_user(self, request: AIProfileRequest) -> AIProfileResponse:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="INTELLIGENCE_AI_ERROR",
                message=(
                    "profile_user is not implemented for the remote intelligence "
                    "provider (stub path removed)"
                ),
                details={"user_id": str(request.user_id)},
            ),
            http_status=501,
        )

    async def _remote_chat(self, request: AIChatRequest) -> AIChatResponse:
        headers = {"Content-Type": "application/json"}
        if self._config.ai_chat_api_key:
            headers["Authorization"] = f"Bearer {self._config.ai_chat_api_key}"
        payload = {
            "model": self._config.ai_chat_model,
            "messages": [m.model_dump() for m in request.messages],
        }
        timeout = float(self._config.ai_chat_timeout_seconds)
        max_retries = max(0, int(self._config.ai_chat_max_retries))
        attempts = max_retries + 1
        started = time.perf_counter()
        last_exc: Exception | None = None

        for attempt in range(1, attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(
                        self._config.ai_chat_base_url,
                        headers=headers,
                        json=payload,
                    )
                if response.status_code in {502, 503, 504} and attempt < attempts:
                    log_event(
                        self._logger,
                        event="ai_provider.chat.retry",
                        message="Retrying remote AI after gateway error",
                        level=logging.WARNING,
                        status_code=response.status_code,
                        attempt=attempt,
                    )
                    continue
                if response.status_code >= 400:
                    raise ServiceError(
                        StandardizedErrorResponse(
                            error_code="INTELLIGENCE_AI_ERROR",
                            message="Remote AI chat provider returned an error",
                            details={
                                "status_code": response.status_code,
                                "body": response.text[:300],
                            },
                        ),
                        http_status=502,
                    )
                data = response.json()
                content = self._extract_content(data)
                provider_label = (
                    "llama_cpp"
                    if "8080" in self._config.ai_chat_base_url
                    or "llama" in self._config.ai_chat_base_url.lower()
                    else "remote_http"
                )
                duration_ms = int((time.perf_counter() - started) * 1000)
                log_event(
                    self._logger,
                    event="ai_provider.chat.remote",
                    message="Remote AI chat completion finished",
                    input_messages=len(request.messages),
                    provider=provider_label,
                    duration_ms=duration_ms,
                    attempt=attempt,
                )
                return AIChatResponse(
                    message=AIChatMessage(role="assistant", content=content),
                    provider=provider_label,
                    model=self._config.ai_chat_model,
                )
            except ServiceError:
                raise
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_exc = exc
                if attempt < attempts:
                    log_event(
                        self._logger,
                        event="ai_provider.chat.retry",
                        message="Retrying remote AI after transport error",
                        level=logging.WARNING,
                        reason=str(exc),
                        attempt=attempt,
                    )
                    continue
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="INTELLIGENCE_AI_ERROR",
                        message="Remote AI chat provider failed",
                        details={"reason": str(exc)},
                    ),
                    http_status=502,
                ) from exc

        raise ServiceError(
            StandardizedErrorResponse(
                error_code="INTELLIGENCE_AI_ERROR",
                message="Remote AI chat provider failed",
                details={"reason": str(last_exc) if last_exc else "unknown"},
            ),
            http_status=502,
        )

    @staticmethod
    def _extract_content(data: dict[str, Any]) -> str:
        if isinstance(data.get("message"), dict) and data["message"].get("content"):
            return str(data["message"]["content"])
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message") or {}
            if message.get("content"):
                return str(message["content"])
        if data.get("content"):
            return str(data["content"])
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="INTELLIGENCE_AI_ERROR",
                message="Remote AI response did not include message content",
            ),
            http_status=502,
        )


async def analyze_task(
    ai: Any,
    request: TaskInsightRequest,
) -> TaskInsightResponse:
    """
    Map TaskInsightRequest → AIChatRequest → complete_chat → TaskInsightResponse.

    Does not extend the shared AIProvider Protocol.
    """
    system = AIChatMessage(
        role="system",
        content=(
            "You analyze task descriptions and reply with a single JSON object "
            "containing suggested_priority, suggested_deadline (ISO-8601 or null), "
            "summary, and confidence (0.0-1.0). "
            "Do not wrap the JSON in markdown fences."
        ),
    )
    user = AIChatMessage(
        role="user",
        content=(
            f"Task id: {request.task_id}\n"
            f"Title: {request.title}\n"
            f"Description: {request.description}\n"
            f"Current priority: {request.current_priority}\n"
            f"Assignee: {request.assignee_id}"
        ),
    )
    try:
        chat = await ai.complete_chat(
            AIChatRequest(
                messages=[system, user],
                metadata={"task_id": str(request.task_id), **dict(request.metadata)},
            )
        )
    except ServiceError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="INTELLIGENCE_AI_ERROR",
                message="AI provider failed during task analysis",
                details={"reason": str(exc)},
            ),
            http_status=502,
        ) from exc

    return _parse_insight_content(chat.message.content, chat.provider, chat.model)


def _parse_insight_content(
    content: str,
    provider: str,
    model: str | None,
) -> TaskInsightResponse:
    raw: dict[str, Any] = {"provider": provider, "model": model}
    cleaned = strip_markdown_fences(content)
    try:
        data = json.loads(cleaned)
        if not isinstance(data, dict):
            raise ValueError("content is not a JSON object")
    except (json.JSONDecodeError, ValueError):
        # Heuristic fallback when the model returns free text.
        priority = "medium"
        lowered = cleaned.lower()
        if "urgent" in lowered or "critical" in lowered:
            priority = "urgent"
        elif "high" in lowered:
            priority = "high"
        elif "low" in lowered:
            priority = "low"
        deadline = datetime.now(timezone.utc) + timedelta(days=7)
        return TaskInsightResponse(
            suggested_priority=priority,
            suggested_deadline=deadline,
            summary=cleaned.strip()[:500] or "AI insight unavailable",
            confidence=0.5,
            provider=provider,
            raw={**raw, "parse": "heuristic"},
        )

    priority = str(data.get("suggested_priority") or "medium")
    summary = str(data.get("summary") or "").strip() or f"Suggested priority: {priority}"
    confidence_raw = data.get("confidence", 0.7)
    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError):
        confidence = 0.7
    confidence = max(0.0, min(1.0, confidence))

    deadline: datetime | None = None
    deadline_raw = data.get("suggested_deadline")
    if deadline_raw:
        if isinstance(deadline_raw, datetime):
            deadline = deadline_raw
        else:
            text = str(deadline_raw).replace("Z", "+00:00")
            try:
                deadline = datetime.fromisoformat(text)
            except ValueError:
                match = re.search(r"\d{4}-\d{2}-\d{2}", text)
                if match:
                    deadline = datetime.fromisoformat(match.group(0)).replace(
                        tzinfo=timezone.utc
                    )
        if deadline is not None and deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)

    return TaskInsightResponse(
        suggested_priority=priority,
        suggested_deadline=deadline,
        summary=summary,
        confidence=confidence,
        provider=provider,
        raw={**raw, "parsed": data},
    )
