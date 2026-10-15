"""NervasRouter — selects active backend from runtime config and delegates."""

from __future__ import annotations

import logging
import time
from typing import Any

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
from services.empery_intelligence_core.src.data.provider_config_store import (
    ProviderConfigStore,
)


class NervasRouter:
    """Facade implementing NervasProvider over pluggable backends."""

    def __init__(
        self,
        store: ProviderConfigStore,
        backends: dict[NervasBackendId, NervasProvider],
        event_bus: EventBus,
        logger: logging.Logger,
        *,
        fallback_local: bool = False,
    ) -> None:
        self._store = store
        self._backends = backends
        self._event_bus = event_bus
        self._logger = logger
        self._fallback_local = fallback_local

    def active_backend_id(self) -> NervasBackendId:
        return self._store.get().active_backend

    def _provider(self) -> tuple[NervasBackendId, NervasProvider]:
        backend_id = self.active_backend_id()
        provider = self._backends.get(backend_id)
        if provider is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="NERVAS_BACKEND_UNAVAILABLE",
                    message=f"Nervas backend '{backend_id.value}' is not registered",
                    details={"backend": backend_id.value},
                ),
                http_status=503,
            )
        return backend_id, provider

    async def generate(self, request: NervasGenerateRequest) -> NervasGenerateResponse:
        return await self._invoke("generate", request)

    async def chat(self, request: NervasChatRequest) -> NervasChatResponse:
        return await self._invoke("chat", request)

    async def reason(self, request: NervasReasonRequest) -> NervasReasonResponse:
        return await self._invoke("reason", request)

    async def plan(self, request: NervasPlanRequest) -> NervasPlanResponse:
        return await self._invoke("plan", request)

    async def health(self) -> NervasBackendHealth:
        backend_id, provider = self._provider()
        health = await provider.health()
        # Ensure reported backend matches the active selection.
        if health.backend != backend_id:
            return NervasBackendHealth(
                backend=backend_id,
                ready=health.ready,
                detail=health.detail,
                base_url=health.base_url,
            )
        return health

    async def _invoke(self, capability: str, request: Any) -> Any:
        backend_id, provider = self._provider()
        started = time.perf_counter()
        try:
            method = getattr(provider, capability)
            result = await method(request)
            latency_ms = int((time.perf_counter() - started) * 1000)
            await self._event_bus.publish(
                Event(
                    name="nervas.invocation.completed",
                    payload={
                        "backend": backend_id.value,
                        "capability": capability,
                        "latency_ms": latency_ms,
                        "model": getattr(result, "model", None),
                    },
                )
            )
            return result
        except ServiceError as exc:
            await self._event_bus.publish(
                Event(
                    name="nervas.invocation.failed",
                    payload={
                        "backend": backend_id.value,
                        "error_code": exc.response.error_code,
                        "capability": capability,
                    },
                )
            )
            if (
                self._fallback_local
                and backend_id != NervasBackendId.LOCAL_LLAMA
                and exc.response.error_code
                in {"NERVAS_BACKEND_UNAVAILABLE", "NERVAS_REMOTE_ERROR"}
            ):
                local = self._backends.get(NervasBackendId.LOCAL_LLAMA)
                if local is not None:
                    log_event(
                        self._logger,
                        event="nervas.fallback_local",
                        message="Falling back to local_llama after backend error",
                        level=logging.WARNING,
                        from_backend=backend_id.value,
                        error_code=exc.response.error_code,
                    )
                    method = getattr(local, capability)
                    return await method(request)
            raise
        except Exception as exc:  # noqa: BLE001 — boundary maps to StandardizedError
            await self._event_bus.publish(
                Event(
                    name="nervas.invocation.failed",
                    payload={
                        "backend": backend_id.value,
                        "error_code": "NERVAS_REMOTE_ERROR",
                        "capability": capability,
                    },
                )
            )
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="NERVAS_REMOTE_ERROR",
                    message="Nervas backend invocation failed",
                    details={"backend": backend_id.value, "reason": str(exc)},
                ),
                http_status=502,
            ) from exc
