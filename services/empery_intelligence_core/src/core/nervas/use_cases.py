"""Nervas application use cases."""

from __future__ import annotations

import logging
import os

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event, EventBus
from core.integration.nervas import (
    NervasBackendHealth,
    NervasBackendId,
    NervasChatRequest,
    NervasChatResponse,
    NervasGenerateRequest,
    NervasGenerateResponse,
    NervasPlanRequest,
    NervasPlanResponse,
    NervasProvider,
    NervasReasonRequest,
    NervasReasonResponse,
)
from core.logging import log_event
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.di import resolve_eic_config
from services.empery_intelligence_core.src.data.provider_config_store import (
    NervasRuntimeConfigUpdate,
    NervasRuntimeConfigView,
    ProviderConfigStore,
)


def _empery_env() -> str:
    return os.environ.get("EMPERY_ENV", "development").strip().lower()


def _refuse_fake_in_hardened_env(backend: NervasBackendId | None) -> None:
    """Ascension law: FakeNervas is forbidden in production/staging."""
    if backend != NervasBackendId.FAKE:
        return
    env = _empery_env()
    if env in {"production", "prod", "staging"}:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="EIC_FAKE_NERVAS_FORBIDDEN",
                message=(
                    "FakeNervas backend is forbidden when "
                    f"EMPERY_ENV={env}"
                ),
            )
        )


class NervasUseCases:
    """Boundary use cases for Nervas generate/chat/reason/plan and config."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _nervas(self) -> NervasProvider:
        return self._container.resolve("nervas_provider")

    def _store(self) -> ProviderConfigStore:
        return self._container.resolve("provider_config_store")

    def _config(self) -> ServiceConfig:
        return resolve_eic_config(self._container)

    def _bus(self) -> EventBus:
        return self._container.resolve("event_bus")

    def _logger(self) -> logging.Logger:
        return self._container.resolve("logger")

    async def generate(self, request: NervasGenerateRequest) -> NervasGenerateResponse:
        return await self._nervas().generate(request)

    async def chat(self, request: NervasChatRequest) -> NervasChatResponse:
        return await self._nervas().chat(request)

    async def reason(self, request: NervasReasonRequest) -> NervasReasonResponse:
        return await self._nervas().reason(request)

    async def plan(self, request: NervasPlanRequest) -> NervasPlanResponse:
        return await self._nervas().plan(request)

    async def health(self) -> NervasBackendHealth:
        return await self._nervas().health()

    def get_config(self) -> NervasRuntimeConfigView:
        cfg = self._config()
        return self._store().to_view(
            openai_configured=bool(cfg.openai_api_key),
            anthropic_configured=bool(cfg.anthropic_api_key),
        )

    async def update_config(
        self,
        patch: NervasRuntimeConfigUpdate,
    ) -> NervasRuntimeConfigView:
        _refuse_fake_in_hardened_env(patch.active_backend)
        updated = self._store().update(patch)
        await self._bus().publish(
            Event(
                name="nervas.config.updated",
                payload={
                    "active_backend": updated.active_backend.value,
                    "source": updated.source,
                },
            )
        )
        log_event(
            self._logger(),
            event="nervas.config.updated",
            message="Nervas runtime config switched",
            active_backend=updated.active_backend.value,
            source=updated.source,
        )
        return self.get_config()
