"""Nervas — canonical Intelligence Provider Interface for Empery World."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field


class NervasBackendId(str, Enum):
    """Supported Nervas backend identifiers."""

    LOCAL_LLAMA = "local_llama"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    FAKE = "fake"


class NervasMessage(BaseModel):
    """Immutable chat message exchanged with Nervas."""

    model_config = ConfigDict(frozen=True)

    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class NervasUsage(BaseModel):
    """Optional token usage reported by a backend."""

    model_config = ConfigDict(frozen=True)

    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


class NervasBackendHealth(BaseModel):
    """Readiness probe for a Nervas backend."""

    model_config = ConfigDict(frozen=True)

    backend: NervasBackendId
    ready: bool
    detail: str = ""
    base_url: str | None = None


class NervasGenerateRequest(BaseModel):
    """One-shot text/code generation request."""

    model_config = ConfigDict(frozen=True)

    prompt: str = Field(min_length=1)
    system: str | None = None
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class NervasGenerateResponse(BaseModel):
    """One-shot generation response."""

    model_config = ConfigDict(frozen=True)

    content: str
    backend: NervasBackendId
    model: str | None = None
    usage: NervasUsage | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class NervasChatRequest(BaseModel):
    """Multi-turn conversational completion request."""

    model_config = ConfigDict(frozen=True)

    messages: list[NervasMessage] = Field(min_length=1)
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1)
    metadata: dict[str, Any] = Field(default_factory=dict)
    # OpenAI-native tools (config_driven Architect/Implementer). Optional.
    tools: list[dict[str, Any]] | None = None
    tool_choice: str | dict[str, Any] | None = None
    # Gemma / llama.cpp chat template: keep thought channel across tool rounds.
    enable_thinking: bool = False
    preserve_thinking: bool = False


class NervasChatResponse(BaseModel):
    """Multi-turn conversational completion response."""

    model_config = ConfigDict(frozen=True)

    message: NervasMessage
    backend: NervasBackendId
    model: str | None = None
    usage: NervasUsage | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class NervasReasonRequest(BaseModel):
    """Structured multi-step reasoning request."""

    model_config = ConfigDict(frozen=True)

    question: str = Field(min_length=1)
    context: str | None = None
    system: str | None = None
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class NervasReasonResponse(BaseModel):
    """Structured reasoning response."""

    model_config = ConfigDict(frozen=True)

    answer: str
    reasoning_trace: str | None = None
    backend: NervasBackendId
    model: str | None = None
    usage: NervasUsage | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class NervasPlanStep(BaseModel):
    """Single step in a Nervas orchestration plan."""

    model_config = ConfigDict(frozen=True)

    id: str
    title: str
    role: Literal["architect", "implementer", "verifier", "refactorer"] | str
    acceptance: str | None = None
    depends_on: list[str] = Field(default_factory=list)


class NervasPlanRequest(BaseModel):
    """Orchestration plan production request."""

    model_config = ConfigDict(frozen=True)

    intention: str = Field(min_length=1)
    constraints: list[str] = Field(default_factory=list)
    context: str | None = None
    system: str | None = None
    model: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class NervasPlanResponse(BaseModel):
    """Orchestration plan response."""

    model_config = ConfigDict(frozen=True)

    summary: str
    steps: list[NervasPlanStep] = Field(min_length=1)
    backend: NervasBackendId
    model: str | None = None
    usage: NervasUsage | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class NervasProvider(Protocol):
    """
    Canonical intelligence provider contract.

    Concrete adapters live under ``services/empery_intelligence_core/src/integration/``
    and are resolved via ServiceContainer as ``nervas_provider``.
    """

    async def generate(self, request: NervasGenerateRequest) -> NervasGenerateResponse: ...

    async def chat(self, request: NervasChatRequest) -> NervasChatResponse: ...

    async def reason(self, request: NervasReasonRequest) -> NervasReasonResponse: ...

    async def plan(self, request: NervasPlanRequest) -> NervasPlanResponse: ...

    async def health(self) -> NervasBackendHealth: ...
