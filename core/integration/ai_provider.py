"""
AIProvider interface contract and Pydantic I/O models.

**Frozen protocol (EIC v0.1+):** Do not add new methods to ``AIProvider``.
Canonical intelligence I/O is ``core.integration.nervas.NervasProvider``
(Generate / Chat / Reason / Plan).

Compatibility path: resolve ``ai_provider`` / ``eic_ai_provider`` as
``NervasAIProviderAdapter`` (in ``services/empery_intelligence_core``) which
maps ``complete_chat`` → ``nervas.chat`` and ``profile_user`` → Nervas
generate/reason. Prefer resolving ``nervas_provider`` for new code.

Duplicate remote HTTP chat clients outside EIC are superseded; do not grow
new ``complete_chat`` HTTP stubs in Trinity services.
"""

from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AIChatMessage(BaseModel):
    """Immutable chat message exchanged with an AI provider."""

    model_config = ConfigDict(frozen=True)

    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1)


class AIChatRequest(BaseModel):
    """Chat completion request contract."""

    model_config = ConfigDict(frozen=True)

    messages: list[AIChatMessage] = Field(min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AIChatResponse(BaseModel):
    """Chat completion response contract."""

    model_config = ConfigDict(frozen=True)

    message: AIChatMessage
    provider: str
    model: str | None = None


class AIProfileRequest(BaseModel):
    """User profiling request contract."""

    model_config = ConfigDict(frozen=True)

    user_id: UUID
    email: str
    display_name: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AIProfileResponse(BaseModel):
    """User profiling payload produced by an AI provider."""

    model_config = ConfigDict(frozen=True)

    summary: str
    traits: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    provider: str
    raw: dict[str, Any] = Field(default_factory=dict)


class AIProvider(Protocol):
    """
    Frozen legacy AI interface for Trinity compatibility.

    Prefer ``NervasProvider`` (``nervas_provider``) for new integrations.
    Fulfill via ``NervasAIProviderAdapter`` over Nervas — not a second HTTP client.
    """

    async def complete_chat(self, request: AIChatRequest) -> AIChatResponse: ...

    async def profile_user(self, request: AIProfileRequest) -> AIProfileResponse: ...
