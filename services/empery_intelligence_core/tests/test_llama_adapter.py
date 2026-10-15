"""Llama.cpp OpenAI-compatible adapter mapping tests (httpx mock)."""

from __future__ import annotations

import asyncio
import json
import logging

import httpx

from core.integration.nervas import (
    NervasBackendId,
    NervasChatRequest,
    NervasGenerateRequest,
    NervasMessage,
    NervasPlanRequest,
    NervasReasonRequest,
)
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.data.provider_config_store import (
    FileProviderConfigStore,
)
from services.empery_intelligence_core.src.integration.llama_cpp import (
    LlamaCppNervasProvider,
)

def _openai_chat_response(content: str) -> dict:
    return {
        "id": "chatcmpl-test",
        "model": "local-model",
        "choices": [{"message": {"role": "assistant", "content": content}}],
        "usage": {
            "prompt_tokens": 3,
            "completion_tokens": 5,
            "total_tokens": 8,
        },
    }


def test_llama_chat_sends_tools_and_thinking(service_config: ServiceConfig) -> None:
    store = FileProviderConfigStore(service_config)
    captured: dict = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/chat/completions"):
            body = json.loads(request.content.decode())
            captured["payload"] = body
            bp = {
                "version": "1.0.0",
                "service_name": "tool_dash",
                "scaffold_profile": "ops_dashboard",
                "assembly_mode": "config_driven",
                "target_module": "Dashboard_Standard",
                "target_component_tree": [
                    {
                        "id": "metric_card",
                        "type": "Widget",
                        "widget_type": "card",
                        "props": {},
                        "children": [],
                    }
                ],
                "data_requirements": [{"endpoint": "/api/v1/metrics", "method": "GET"}],
            }
            return httpx.Response(
                200,
                json={
                    "id": "chatcmpl-tools",
                    "model": "local-model",
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": "",
                                "tool_calls": [
                                    {
                                        "id": "c1",
                                        "type": "function",
                                        "function": {
                                            "name": "emit_blueprint",
                                            "arguments": json.dumps(
                                                {"blueprint": bp}
                                            ),
                                        },
                                    }
                                ],
                            }
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 1,
                        "completion_tokens": 1,
                        "total_tokens": 2,
                    },
                },
            )
        return httpx.Response(404)

    async def _run() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            provider = LlamaCppNervasProvider(
                service_config,
                store,
                logging.getLogger("test"),
                client=client,
            )
            from core.integration.assembly_contracts import openai_assembly_tools

            chat = await provider.chat(
                NervasChatRequest(
                    messages=[NervasMessage(role="user", content="architect")],
                    tools=openai_assembly_tools(role="architect"),
                    tool_choice="auto",
                    enable_thinking=True,
                    preserve_thinking=True,
                )
            )
            assert "blueprint" in chat.message.content
            assert "tool_dash" in chat.message.content
            payload = captured["payload"]
            assert payload["tools"]
            assert payload["tool_choice"] == "auto"
            assert payload["chat_template_kwargs"]["enable_thinking"] is True
            assert payload["chat_template_kwargs"]["preserve_thinking"] is True
            assert payload["parallel_tool_calls"] is False

    asyncio.run(_run())


def test_llama_generate_chat_reason_plan(service_config: ServiceConfig) -> None:
    store = FileProviderConfigStore(service_config)

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/chat/completions"):
            body = request.content.decode()
            if "Intention" in body or "orchestration plans" in body:
                content = (
                    '{"summary":"ok","steps":[{"id":"1","title":"A",'
                    '"role":"architect","acceptance":"done","depends_on":[]}]}'
                )
            else:
                content = "llama-ok"
            return httpx.Response(200, json=_openai_chat_response(content))
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": []})
        return httpx.Response(404)

    async def _run() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            provider = LlamaCppNervasProvider(
                service_config,
                store,
                logging.getLogger("test"),
                client=client,
            )

            gen = await provider.generate(NervasGenerateRequest(prompt="hi"))
            assert gen.backend == NervasBackendId.LOCAL_LLAMA
            assert gen.content == "llama-ok"
            assert gen.usage is not None
            assert gen.usage.total_tokens == 8

            chat = await provider.chat(
                NervasChatRequest(
                    messages=[NervasMessage(role="user", content="yo")]
                )
            )
            assert chat.message.content == "llama-ok"

            reason = await provider.reason(NervasReasonRequest(question="q"))
            assert reason.answer == "llama-ok"

            plan = await provider.plan(NervasPlanRequest(intention="do work"))
            assert plan.steps[0].title == "A"

            health = await provider.health()
            assert health.ready is True

    asyncio.run(_run())
