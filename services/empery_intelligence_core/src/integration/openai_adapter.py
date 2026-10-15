"""OpenAI cloud Nervas adapter — graceful if API key unset."""

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


class OpenAINervasProvider:
    """
    OpenAI-style chat completions backend.

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
        # Reuse OpenAI-compatible parsing helpers via a thin internal client.
        self._parser = LlamaCppNervasProvider(config, store, logger, client=client)

    def _configured(self) -> bool:
        return bool(self._config.openai_api_key)

    def _model(self, override: str | None) -> str:
        return (
            override
            or self._store.get().openai_model
            or self._config.openai_model
            or ""
        )

    async def health(self) -> NervasBackendHealth:
        if not self._configured():
            return NervasBackendHealth(
                backend=NervasBackendId.OPENAI,
                ready=False,
                detail="EIC_OPENAI_API_KEY not set",
                base_url=self._config.openai_base_url,
            )
        return NervasBackendHealth(
            backend=NervasBackendId.OPENAI,
            ready=True,
            detail="API key configured",
            base_url=self._config.openai_base_url,
        )

    def _ensure_ready(self) -> None:
        if not self._configured():
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="NERVAS_BACKEND_UNAVAILABLE",
                    message="OpenAI backend unavailable: API key not configured",
                    details={"backend": "openai"},
                ),
                http_status=503,
            )

    async def generate(self, request: NervasGenerateRequest) -> NervasGenerateResponse:
        self._ensure_ready()
        messages: list[dict[str, str]] = []
        if request.system:
            messages.append({"role": "system", "content": request.system})
        messages.append({"role": "user", "content": request.prompt})
        data = await self._post(messages, model=request.model, temperature=request.temperature, max_tokens=request.max_tokens)
        return NervasGenerateResponse(
            content=self._parser._extract_content(data),
            backend=NervasBackendId.OPENAI,
            model=data.get("model") or self._model(request.model),
            usage=self._parser._usage(data),
            raw=data,
        )

    async def chat(self, request: NervasChatRequest) -> NervasChatResponse:
        self._ensure_ready()
        data = await self._post(
            [m.model_dump() for m in request.messages],
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        return NervasChatResponse(
            message=NervasMessage(
                role="assistant",
                content=self._parser._extract_content(data),
            ),
            backend=NervasBackendId.OPENAI,
            model=data.get("model") or self._model(request.model),
            usage=self._parser._usage(data),
            raw=data,
        )

    async def reason(self, request: NervasReasonRequest) -> NervasReasonResponse:
        self._ensure_ready()
        # Delegate structure via temporary generate-style messages
        gen = NervasGenerateRequest(
            prompt=(
                f"Context:\n{request.context}\n\nQuestion:\n{request.question}"
                if request.context
                else request.question
            ),
            system=request.system
            or "You are a careful reasoning assistant. Think step by step.",
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        out = await self.generate(gen)
        return NervasReasonResponse(
            answer=out.content,
            reasoning_trace=None,
            backend=NervasBackendId.OPENAI,
            model=out.model,
            usage=out.usage,
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
        data = await self._post(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            model=request.model,
            temperature=None,
            max_tokens=None,
        )
        content = self._parser._extract_content(data)
        summary, steps = self._parser._parse_plan(content, request.intention)
        return NervasPlanResponse(
            summary=summary,
            steps=steps,
            backend=NervasBackendId.OPENAI,
            model=data.get("model") or self._model(request.model),
            usage=self._parser._usage(data),
            raw={"content": content, **data},
        )

    async def _post(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None,
        temperature: float | None,
        max_tokens: int | None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self._model(model),
            "messages": messages,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        headers = {
            "Authorization": f"Bearer {self._config.openai_api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self._config.openai_base_url.rstrip('/')}/chat/completions"
        owns = self._client is None
        client = self._client or httpx.AsyncClient(timeout=self._config.nervas_timeout_s)
        try:
            try:
                response = await client.post(url, headers=headers, json=payload)
            except httpx.HTTPError as exc:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="NERVAS_REMOTE_ERROR",
                        message="OpenAI request failed",
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
                    message="OpenAI returned an error",
                    details={"status_code": response.status_code},
                ),
                http_status=502,
            )
        data = response.json()
        return data if isinstance(data, dict) else {"raw": data}
