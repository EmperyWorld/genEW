"""Local llama.cpp OpenAI-compatible Nervas adapter."""

from __future__ import annotations

import json
import logging
import re
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
    NervasPlanStep,
    NervasReasonRequest,
    NervasReasonResponse,
    NervasUsage,
)
from core.logging import log_event
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.data.provider_config_store import (
    ProviderConfigStore,
)


class LlamaCppNervasProvider:
    """OpenAI-compatible client targeting local llama.cpp (default :8080)."""

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

    def _base_url(self) -> str:
        return self._store.get().local_base_url.rstrip("/")

    def _model(self, override: str | None) -> str:
        return override or self._store.get().local_model or self._config.llama_model

    def _chat_url(self) -> str:
        path = self._config.llama_chat_path
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{self._base_url()}{path}"

    async def _client_ctx(self) -> httpx.AsyncClient:
        if self._client is not None:
            return self._client
        return httpx.AsyncClient(timeout=self._config.nervas_timeout_s)

    async def health(self) -> NervasBackendHealth:
        url = self._base_url()
        try:
            owns_client = self._client is None
            client = await self._client_ctx()
            try:
                # Prefer models listing; fall back to root.
                resp = await client.get(f"{url}/v1/models")
                if resp.status_code >= 500:
                    resp = await client.get(url)
                ready = resp.status_code < 500
                return NervasBackendHealth(
                    backend=NervasBackendId.LOCAL_LLAMA,
                    ready=ready,
                    detail=f"HTTP {resp.status_code}",
                    base_url=url,
                )
            finally:
                if owns_client:
                    await client.aclose()
        except Exception as exc:  # noqa: BLE001
            return NervasBackendHealth(
                backend=NervasBackendId.LOCAL_LLAMA,
                ready=False,
                detail=str(exc),
                base_url=url,
            )

    async def generate(self, request: NervasGenerateRequest) -> NervasGenerateResponse:
        messages: list[dict[str, str]] = []
        if request.system:
            messages.append({"role": "system", "content": request.system})
        messages.append({"role": "user", "content": request.prompt})
        data = await self._chat_completions(
            messages,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        return NervasGenerateResponse(
            content=self._extract_content(data),
            backend=NervasBackendId.LOCAL_LLAMA,
            model=data.get("model") or self._model(request.model),
            usage=self._usage(data),
            raw=data if isinstance(data, dict) else {},
        )

    async def chat(self, request: NervasChatRequest) -> NervasChatResponse:
        messages = [m.model_dump() for m in request.messages]
        data = await self._chat_completions(
            messages,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            tools=request.tools,
            tool_choice=request.tool_choice,
            enable_thinking=request.enable_thinking,
            preserve_thinking=request.preserve_thinking,
        )
        content = self._extract_content(data)
        if not (content or "").strip():
            content = "(empty)"
        return NervasChatResponse(
            message=NervasMessage(role="assistant", content=content),
            backend=NervasBackendId.LOCAL_LLAMA,
            model=data.get("model") or self._model(request.model),
            usage=self._usage(data),
            raw=data if isinstance(data, dict) else {},
        )

    async def reason(self, request: NervasReasonRequest) -> NervasReasonResponse:
        system = request.system or (
            "You are a careful reasoning assistant. Think step by step, "
            "then provide a final answer."
        )
        user = request.question
        if request.context:
            user = f"Context:\n{request.context}\n\nQuestion:\n{request.question}"
        data = await self._chat_completions(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        content = self._extract_content(data)
        return NervasReasonResponse(
            answer=content,
            reasoning_trace=None,
            backend=NervasBackendId.LOCAL_LLAMA,
            model=data.get("model") or self._model(request.model),
            usage=self._usage(data),
            raw=data if isinstance(data, dict) else {},
        )

    async def plan(self, request: NervasPlanRequest) -> NervasPlanResponse:
        system = request.system or (
            "You produce orchestration plans as JSON with keys "
            "`summary` and `steps` (list of {id,title,role,acceptance,depends_on})."
        )
        user = f"Intention: {request.intention}"
        if request.constraints:
            user += "\nConstraints:\n- " + "\n- ".join(request.constraints)
        if request.context:
            user += f"\nContext:\n{request.context}"
        data = await self._chat_completions(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            model=request.model,
            temperature=None,
            max_tokens=None,
        )
        content = self._extract_content(data)
        summary, steps = self._parse_plan(content, request.intention)
        return NervasPlanResponse(
            summary=summary,
            steps=steps,
            backend=NervasBackendId.LOCAL_LLAMA,
            model=data.get("model") or self._model(request.model),
            usage=self._usage(data),
            raw={"content": content, **(data if isinstance(data, dict) else {})},
        )

    async def _chat_completions(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None,
        temperature: float | None,
        max_tokens: int | None,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        enable_thinking: bool = False,
        preserve_thinking: bool = False,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self._model(model),
            "messages": messages,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if tools:
            payload["tools"] = tools
            if tool_choice is not None:
                payload["tool_choice"] = tool_choice
            else:
                payload["tool_choice"] = "auto"
            payload["parallel_tool_calls"] = False
        if enable_thinking or preserve_thinking:
            # Gemma 4 / llama.cpp: reopen thought channel after tool_response.
            payload["chat_template_kwargs"] = {
                "enable_thinking": bool(enable_thinking),
                "preserve_thinking": bool(preserve_thinking),
            }
        owns_client = self._client is None
        client = await self._client_ctx()
        try:
            try:
                response = await client.post(self._chat_url(), json=payload)
            except httpx.HTTPError as exc:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="NERVAS_BACKEND_UNAVAILABLE",
                        message="Local llama.cpp backend unreachable",
                        details={"base_url": self._base_url(), "reason": str(exc)},
                    ),
                    http_status=503,
                ) from exc
        finally:
            if owns_client:
                await client.aclose()

        if response.status_code >= 400:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="NERVAS_REMOTE_ERROR",
                    message="Local llama.cpp returned an error",
                    details={
                        "status_code": response.status_code,
                        "body": response.text[:500],
                    },
                ),
                http_status=502,
            )
        data = response.json()
        log_event(
            self._logger,
            event="nervas.llama.chat",
            message="llama.cpp chat completion ok",
            model=payload["model"],
            has_tools=bool(tools),
        )
        return data if isinstance(data, dict) else {"raw": data}

    @staticmethod
    def _extract_content(data: dict[str, Any]) -> str:
        from core.integration.assembly_contracts import materialize_assembly_tool_calls

        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            msg = choices[0].get("message") if isinstance(choices[0], dict) else None
            if isinstance(msg, dict):
                tool_text = materialize_assembly_tool_calls(msg.get("tool_calls"))
                if tool_text:
                    return tool_text
                if msg.get("content"):
                    return str(msg["content"])
            if isinstance(choices[0], dict) and choices[0].get("text"):
                return str(choices[0]["text"])
        if isinstance(data.get("message"), dict) and data["message"].get("content"):
            return str(data["message"]["content"])
        if data.get("content"):
            return str(data["content"])
        return json.dumps(data)

    @staticmethod
    def _usage(data: dict[str, Any]) -> NervasUsage | None:
        usage = data.get("usage")
        if not isinstance(usage, dict):
            return None
        return NervasUsage(
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
        )

    @staticmethod
    def _parse_plan(
        content: str, intention: str
    ) -> tuple[str, list[NervasPlanStep]]:
        try:
            match = re.search(r"\{[\s\S]*\}", content)
            raw = json.loads(match.group(0) if match else content)
            summary = str(raw.get("summary") or f"Plan for {intention[:80]}")
            steps_raw = raw.get("steps") or []
            steps = [
                NervasPlanStep(
                    id=str(s.get("id", i + 1)),
                    title=str(s.get("title", f"Step {i + 1}")),
                    role=str(s.get("role", "implementer")),
                    acceptance=s.get("acceptance"),
                    depends_on=list(s.get("depends_on") or []),
                )
                for i, s in enumerate(steps_raw)
                if isinstance(s, dict)
            ]
            if steps:
                return summary, steps
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        return (
            content[:500] or f"Plan for {intention[:80]}",
            [
                NervasPlanStep(
                    id="1",
                    title="Execute intention",
                    role="implementer",
                    acceptance="Done",
                )
            ],
        )
