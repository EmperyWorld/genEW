"""Cloud adapters degrade gracefully without API keys."""

from __future__ import annotations

import asyncio
import logging

import pytest

from core.errors import ServiceError
from core.integration.nervas import NervasChatRequest, NervasMessage
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.data.provider_config_store import (
    FileProviderConfigStore,
)
from services.empery_intelligence_core.src.integration.anthropic_adapter import (
    AnthropicNervasProvider,
)
from services.empery_intelligence_core.src.integration.openai_adapter import (
    OpenAINervasProvider,
)


def test_import_cloud_adapters_without_keys() -> None:
    from services.empery_intelligence_core.src.integration import (  # noqa: F401
        anthropic_adapter,
        openai_adapter,
    )


def test_openai_unavailable_without_key(service_config: ServiceConfig) -> None:
    store = FileProviderConfigStore(service_config)
    provider = OpenAINervasProvider(
        service_config, store, logging.getLogger("test")
    )

    async def _run() -> None:
        health = await provider.health()
        assert health.ready is False
        with pytest.raises(ServiceError) as exc:
            await provider.chat(
                NervasChatRequest(
                    messages=[NervasMessage(role="user", content="hi")]
                )
            )
        assert exc.value.response.error_code == "NERVAS_BACKEND_UNAVAILABLE"

    asyncio.run(_run())


def test_anthropic_unavailable_without_key(service_config: ServiceConfig) -> None:
    store = FileProviderConfigStore(service_config)
    provider = AnthropicNervasProvider(
        service_config, store, logging.getLogger("test")
    )

    async def _run() -> None:
        health = await provider.health()
        assert health.ready is False
        with pytest.raises(ServiceError) as exc:
            await provider.chat(
                NervasChatRequest(
                    messages=[NervasMessage(role="user", content="hi")]
                )
            )
        assert exc.value.response.error_code == "NERVAS_BACKEND_UNAVAILABLE"

    asyncio.run(_run())
