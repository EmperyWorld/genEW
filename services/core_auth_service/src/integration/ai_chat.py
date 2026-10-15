"""Concrete AIProvider implementation for core_auth_service."""

from __future__ import annotations

import hashlib
import logging
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
from services.core_auth_service.config import ServiceConfig


class CoreAuthAIProvider:
    """
    AIProvider fulfillment for auth/profiling workflows.

    Uses the configured HTTP chat endpoint when ``ai_chat_api_key`` is set;
    otherwise produces deterministic local profiling/chat payloads so the
    interface is fully exercised without an external dependency.
    """

    def __init__(self, config: ServiceConfig, logger: logging.Logger) -> None:
        self._config = config
        self._logger = logger

    async def complete_chat(self, request: AIChatRequest) -> AIChatResponse:
        if not request.messages:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="AI_CHAT_EMPTY_MESSAGES",
                    message="At least one chat message is required",
                )
            )

        if self._config.ai_chat_api_key:
            try:
                return await self._remote_chat(request)
            except ServiceError:
                raise
            except Exception as exc:  # noqa: BLE001 — boundary maps to StandardizedError
                log_event(
                    self._logger,
                    event="ai_provider.remote_chat_fallback",
                    message="Remote AI chat failed; using local fallback",
                    level=logging.WARNING,
                    reason=str(exc),
                )

        return self._local_chat(request)

    async def profile_user(self, request: AIProfileRequest) -> AIProfileResponse:
        if self._config.ai_chat_api_key:
            try:
                return await self._remote_profile(request)
            except ServiceError:
                raise
            except Exception as exc:  # noqa: BLE001
                log_event(
                    self._logger,
                    event="ai_provider.remote_profile_fallback",
                    message="Remote AI profiling failed; using local fallback",
                    level=logging.WARNING,
                    reason=str(exc),
                )

        return self._local_profile(request)

    async def _remote_chat(self, request: AIChatRequest) -> AIChatResponse:
        headers = {
            "Authorization": f"Bearer {self._config.ai_chat_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._config.ai_chat_model,
            "messages": [m.model_dump() for m in request.messages],
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self._config.ai_chat_base_url,
                headers=headers,
                json=payload,
            )
        if response.status_code >= 400:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="AI_CHAT_REMOTE_ERROR",
                    message="Remote AI chat provider returned an error",
                    details={"status_code": response.status_code},
                ),
                http_status=502,
            )
        data = response.json()
        content = self._extract_content(data)
        log_event(
            self._logger,
            event="ai_provider.chat.remote",
            message="Remote AI chat completion finished",
            input_messages=len(request.messages),
        )
        return AIChatResponse(
            message=AIChatMessage(role="assistant", content=content),
            provider="remote_http",
            model=self._config.ai_chat_model,
        )

    async def _remote_profile(self, request: AIProfileRequest) -> AIProfileResponse:
        chat = await self._remote_chat(
            AIChatRequest(
                messages=[
                    AIChatMessage(
                        role="system",
                        content=(
                            "Produce a short user profile summary with traits "
                            "and interests as plain text."
                        ),
                    ),
                    AIChatMessage(
                        role="user",
                        content=(
                            f"Profile user {request.display_name} "
                            f"<{request.email}> id={request.user_id}"
                        ),
                    ),
                ]
            )
        )
        # Remote providers may return free text; wrap into structured profile.
        summary = chat.message.content.strip()
        return AIProfileResponse(
            summary=summary,
            traits=["remote_profiled"],
            interests=["eworld"],
            confidence=0.6,
            provider="remote_http",
            raw={"source": "chat_completion", "model": chat.model},
        )

    def _local_chat(self, request: AIChatRequest) -> AIChatResponse:
        last_user = next(
            (m for m in reversed(request.messages) if m.role == "user"),
            request.messages[-1],
        )
        content = (
            f"[local:{self._config.ai_chat_model}] "
            f"Acknowledged for {last_user.content[:240]}"
        )
        log_event(
            self._logger,
            event="ai_provider.chat.local",
            message="Local AI chat completion finished",
            input_messages=len(request.messages),
        )
        return AIChatResponse(
            message=AIChatMessage(role="assistant", content=content),
            provider="local_deterministic",
            model=self._config.ai_chat_model,
        )

    def _local_profile(self, request: AIProfileRequest) -> AIProfileResponse:
        digest = hashlib.sha256(
            f"{request.user_id}:{request.email}:{request.display_name}".encode()
        ).hexdigest()
        trait_pool = [
            "curious",
            "methodical",
            "collaborative",
            "pragmatic",
            "analytical",
            "creative",
        ]
        interest_pool = [
            "authentication",
            "distributed_systems",
            "ai_assistants",
            "developer_tools",
            "security",
            "data_platforms",
        ]
        traits = [trait_pool[int(digest[i : i + 2], 16) % len(trait_pool)] for i in (0, 2, 4)]
        # Deduplicate while preserving order.
        traits = list(dict.fromkeys(traits))
        interests = [
            interest_pool[int(digest[i : i + 2], 16) % len(interest_pool)] for i in (6, 8, 10)
        ]
        interests = list(dict.fromkeys(interests))
        confidence = round(0.55 + (int(digest[12:14], 16) / 255.0) * 0.4, 3)
        local_part = request.email.split("@", 1)[0]
        summary = (
            f"{request.display_name} ({request.email}) is a {traits[0]} EWorld user "
            f"with interests in {', '.join(interests)}. "
            f"Handle '{local_part}' suggests an engaged platform participant."
        )
        raw: dict[str, Any] = {
            "algorithm": "sha256-deterministic",
            "digest_prefix": digest[:12],
            "metadata": dict(request.metadata),
        }
        log_event(
            self._logger,
            event="ai_provider.profile.local",
            message="Local AI user profile generated",
            user_id=str(request.user_id),
            confidence=confidence,
        )
        return AIProfileResponse(
            summary=summary,
            traits=traits,
            interests=interests,
            confidence=confidence,
            provider="local_deterministic",
            raw=raw,
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
                error_code="AI_CHAT_INVALID_RESPONSE",
                message="Remote AI response did not include message content",
            ),
            http_status=502,
        )


# Backward-compatible alias used by earlier scaffold imports.
AiChatAdapter = CoreAuthAIProvider
