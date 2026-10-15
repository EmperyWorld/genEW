"""Live llama.cpp integration — skipped when EIC_LLM_BASE_URL is unreachable.

CI uses FakeNervas / httpx mocks. This module exercises the real Local provider
client against an OpenAI-compatible endpoint (default http://127.0.0.1:8080).
"""

from __future__ import annotations

import os

import httpx
import pytest

from core.integration.nervas import NervasBackendId, NervasReasonRequest
from core.logging import configure_logging
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.data.provider_config_store import (
    FileProviderConfigStore,
)
from services.empery_intelligence_core.src.integration.llama_cpp import (
    LlamaCppNervasProvider,
)


def _llm_base_url() -> str:
    return os.environ.get(
        "EIC_LLM_BASE_URL",
        os.environ.get("EIC_LLAMA_BASE_URL", "http://127.0.0.1:8080"),
    ).rstrip("/")


def _llama_reachable() -> bool:
    url = _llm_base_url()
    try:
        with httpx.Client(timeout=2.0) as client:
            resp = client.get(f"{url}/v1/models")
            if resp.status_code < 500:
                return True
            resp = client.get(url)
            return resp.status_code < 500
    except (httpx.HTTPError, OSError):
        return False


pytestmark = pytest.mark.skipif(
    not _llama_reachable(),
    reason=f"llama.cpp unreachable at {_llm_base_url()} (set EIC_LLM_BASE_URL)",
)


@pytest.mark.asyncio
async def test_live_reason_via_llama_cpp(tmp_path) -> None:
    """Life Test 2 (Intelligence): reason against a live local LLM."""
    base = _llm_base_url()
    cfg = ServiceConfig(
        use_fake_nervas=False,
        nervas_backend=NervasBackendId.LOCAL_LLAMA,
        provider_id="local",
        llm_base_url=base,
        llama_base_url=base,
        provider_config_path=str(tmp_path / "runtime.json"),
        nervas_timeout_s=60.0,
        worker_enabled=False,
    )
    logger = configure_logging("eic_live_llama")
    store = FileProviderConfigStore(cfg, logger)
    provider = LlamaCppNervasProvider(cfg, store, logger)

    health = await provider.health()
    assert health.ready is True
    assert health.backend == NervasBackendId.LOCAL_LLAMA

    result = await provider.reason(
        NervasReasonRequest(
            question="What is 2+2? Reply with a single integer.",
            context=None,
        )
    )
    assert result.backend == NervasBackendId.LOCAL_LLAMA
    assert result.answer.strip()
    assert "4" in result.answer or "four" in result.answer.lower()
