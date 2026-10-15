"""Anthropic cloud Nervas adapter — graceful if API key unset."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from core.errors import ServiceError, StandardizedErrorResponse
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
    NervasReasonRequest,
    NervasReasonResponse,
)
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.data.provider_config_store import (
    ProviderConfigStore,
)
from services.empery_intelligence_core.src.integration.llama_cpp import (
    LlamaCppNervasProvider,
)


class AnthropicNervasProvider:
    """
    Anthropic Messages API backend.

    Import and construction succeed without a key; invocations raise
    ``NERVAS_BACKEND_UNAVAILABLE`` when the key is empty.
    """

    def __init__(
        self,
        config: ServiceConfig,
        store: ProviderConfigStore,
        logger: logging.Logger,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._config = config
        self._store = store
        self._logger = logger
        self._client = client
        self._parser = LlamaCppNervasProvider(config, store, logger, client=client)

    def _configured(self) -> bool:
        return bool(self._config.anthropic_api_key)

    def _model(self, override: str | None) -> str:
        return (
            override
            or self._store.get().anthropic_model
            or self._config.anthropic_model
            or ""
        )

    async def health(self) -> NervasBackendHealth:
        if not self._configured():
            return NervasBackendHealth(
                backend=NervasBackendId.ANTHROPIC,
                ready=False,
                detail="EIC_ANTHROPIC_API_KEY not set",
                base_url=self._config.anthropic_base_url,
            )
        return NervasBackendHealth(
            backend=NervasBackendId.ANTHROPIC,
            ready=True,
            detail="API key configured",
            base_url=self._config.anthropic_base_url,
        )

    def _ensure_ready(self) -> None:
        if not self._configured():
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="NERVAS_BACKEND_UNAVAILABLE",
                    message="Anthropic backend unavailable: API key not configured",
                    details={"backend": "anthropic"},
                ),
                http_status=503,
            )

    async def generate(self, request: NervasGenerateRequest) -> NervasGenerateResponse:
        self._ensure_ready()
        content = await self._messages(
            system=request.system,
            messages=[{"role": "user", "content": request.prompt}],
            model=request.model,
            max_tokens=request.max_tokens or 1024,
            temperature=request.temperature,
        )
        return NervasGenerateResponse(
            content=content,
            backend=NervasBackendId.ANTHROPIC,
            model=self._model(request.model),
        )

    async def chat(self, request: NervasChatRequest) -> NervasChatResponse:
        self._ensure_ready()
        system_parts = [m.content for m in request.messages if m.role == "system"]
        rest = [
            {"role": m.role, "content": m.content}
            for m in request.messages
            if m.role != "system"
        ]
        if not rest:
            rest = [{"role": "user", "content": "Hello"}]
        # Anthropic only allows user/assistant roles in messages.
        normalized = []
        for m in rest:
            role = m["role"] if m["role"] in {"user", "assistant"} else "user"
            normalized.append({"role": role, "content": m["content"]})
        content = await self._messages(
            system="\n\n".join(system_parts) if system_parts else None,
            messages=normalized,
            model=request.model,
            max_tokens=request.max_tokens or 1024,
            temperature=request.temperature,
        )
        return NervasChatResponse(
            message=NervasMessage(role="assistant", content=content),
            backend=NervasBackendId.ANTHROPIC,
            model=self._model(request.model),
        )

    async def reason(self, request: NervasReasonRequest) -> NervasReasonResponse:
        self._ensure_ready()
        prompt = (
            f"Context:\n{request.context}\n\nQuestion:\n{request.question}"
            if request.context
            else request.question
        )
        out = await self.generate(
            NervasGenerateRequest(
                prompt=prompt,
                system=request.system
                or "You are a careful reasoning assistant. Think step by step.",
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        )
        return NervasReasonResponse(
            answer=out.content,
            backend=NervasBackendId.ANTHROPIC,
            model=out.model,
            raw=out.raw,
        )

    async def plan(self, request: NervasPlanRequest) -> NervasPlanResponse:
        self._ensure_ready()
        system = request.system or (
            "You produce orchestration plans as JSON with keys "
            "`summary` and `steps` (list of {id,title,role,acceptance,depends_on})."
        )
        user = f"Intention: {request.intention}"
        if request.context:
            user += f"\nContext:\n{request.context}"
        content = await self._messages(
            system=system,
            messages=[{"role": "user", "content": user}],
            model=request.model,
            max_tokens=2048,
            temperature=None,
        )
        summary, steps = self._parser._parse_plan(content, request.intention)
        return NervasPlanResponse(
            summary=summary,
            steps=steps,
            backend=NervasBackendId.ANTHROPIC,
            model=self._model(request.model),
            raw={"content": content},
        )

    async def _messages(
        self,
        *,
        system: str | None,
        messages: list[dict[str, str]],
        model: str | None,
        max_tokens: int,
        temperature: float | None,
    ) -> str:
        payload: dict[str, Any] = {
            "model": self._model(model),
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system:
            payload["system"] = system
        if temperature is not None:
            payload["temperature"] = temperature
        headers = {
            "x-api-key": self._config.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        url = f"{self._config.anthropic_base_url.rstrip('/')}/v1/messages"
        owns = self._client is None
        client = self._client or httpx.AsyncClient(timeout=self._config.nervas_timeout_s)
        try:
            try:
                response = await client.post(url, headers=headers, json=payload)
            except httpx.HTTPError as exc:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="NERVAS_REMOTE_ERROR",
                        message="Anthropic request failed",
                        details={"reason": str(exc)},
                    ),
                    http_status=502,
                ) from exc
        finally:
            if owns:
                await client.aclose()
        if response.status_code >= 400:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="NERVAS_REMOTE_ERROR",
                    message="Anthropic returned an error",
                    details={"status_code": response.status_code},
                ),
                http_status=502,
            )
        data = response.json()
        return self._extract_anthropic_text(data)

    @staticmethod
    def _extract_anthropic_text(data: dict[str, Any]) -> str:
        content = data.get("content")
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(str(block.get("text", "")))
            if parts:
                return "\n".join(parts)
        return str(data)
