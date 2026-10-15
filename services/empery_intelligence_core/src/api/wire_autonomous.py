"""DI wiring for Autonomous Mode facade (Interface slice).

Called from main.py under ``# --- AUTONOMOUS WIRING ---``.
Delegates to eic_queue_port / eic_memory_port / nervas_provider_registry when
present; otherwise registers thin in-memory fakes so ECC tests can run.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import create_event_bus
from core.integration.nervas import NervasBackendId
from core.logging import configure_logging
from services.empery_intelligence_core.config import ServiceConfig
from services.empery_intelligence_core.src.core.autonomous_use_cases import (
    EicAutonomousUseCases,
)
from services.empery_intelligence_core.src.data.schemas_autonomous import (
    LlmHealthResponse,
    ProviderConfigResponse,
    ProviderDescriptor,
    ProviderId,
    SetProviderResponse,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


_PROVIDER_TO_BACKEND = {
    ProviderId.LOCAL: NervasBackendId.LOCAL_LLAMA,
    ProviderId.OPENAI: NervasBackendId.OPENAI,
    ProviderId.ANTHROPIC: NervasBackendId.ANTHROPIC,
    ProviderId.FAKE: NervasBackendId.FAKE,
}

_BACKEND_TO_PROVIDER = {
    NervasBackendId.LOCAL_LLAMA: ProviderId.LOCAL,
    NervasBackendId.OPENAI: ProviderId.OPENAI,
    NervasBackendId.ANTHROPIC: ProviderId.ANTHROPIC,
    NervasBackendId.FAKE: ProviderId.FAKE,
}


class NervasRegistryAdapter:
    """Adapt provider_config_store + nervas_provider to NervasProviderRegistryPort."""

    def __init__(self, container: ServiceContainer, config: ServiceConfig) -> None:
        self._container = container
        self._config = config
        self._updated_at = _utcnow()
        self._runtime_override = False

    def list_providers(self) -> ProviderConfigResponse:
        active = ProviderId(self._config.provider_id)
        llm_base = self._config.llm_base_url
        if self._container.has("provider_config_store"):
            store = self._container.resolve("provider_config_store")
            runtime = store.get()
            active = _BACKEND_TO_PROVIDER.get(
                runtime.active_backend, ProviderId.LOCAL
            )
            llm_base = runtime.local_base_url
            self._runtime_override = runtime.source != "env"
        return ProviderConfigResponse(
            active_provider_id=active,
            available=[
                ProviderDescriptor(
                    id=ProviderId.LOCAL,
                    label="Local (llama-cpp)",
                    configured=True,
                    healthy=None,
                    is_local=True,
                ),
                *(
                    [
                        ProviderDescriptor(
                            id=ProviderId.FAKE,
                            label="Fake (CI / tests only)",
                            configured=True,
                            healthy=True,
                            is_local=True,
                        )
                    ]
                    if self._config.allow_autonomous_fakes
                    or self._config.use_fake_nervas
                    else []
                ),
                ProviderDescriptor(
                    id=ProviderId.OPENAI,
                    label="OpenAI",
                    configured=bool(self._config.openai_api_key),
                    healthy=None,
                    is_local=False,
                ),
                ProviderDescriptor(
                    id=ProviderId.ANTHROPIC,
                    label="Anthropic",
                    configured=bool(self._config.anthropic_api_key),
                    healthy=None,
                    is_local=False,
                ),
            ],
            llm_base_url=llm_base,
            runtime_override=self._runtime_override,
            updated_at=self._updated_at,
        )

    async def set_active(
        self, provider_id: ProviderId, *, llm_base_url: str | None
    ) -> SetProviderResponse:
        if provider_id == ProviderId.OPENAI and not self._config.openai_api_key:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_PROVIDER_NOT_CONFIGURED",
                    message="OpenAI provider is not configured (missing API key)",
                ),
                http_status=400,
            )
        if provider_id == ProviderId.ANTHROPIC and not self._config.anthropic_api_key:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_PROVIDER_NOT_CONFIGURED",
                    message="Anthropic provider is not configured (missing API key)",
                ),
                http_status=400,
            )

        before = self.list_providers().active_provider_id
        if self._container.has("provider_config_store"):
            from services.empery_intelligence_core.src.data.provider_config_store import (
                NervasRuntimeConfigUpdate,
            )

            store = self._container.resolve("provider_config_store")
            patch_kwargs: dict[str, Any] = {
                "active_backend": _PROVIDER_TO_BACKEND[provider_id],
                "source": "runtime_override",
            }
            if llm_base_url:
                patch_kwargs["local_base_url"] = llm_base_url
            store.update(NervasRuntimeConfigUpdate(**patch_kwargs))
        else:
            # Fall back: update in-memory fake if present (tests only)
            if self._container.has("nervas_provider_registry"):
                from services.empery_intelligence_core.tests.fakes import (
                    InMemoryNervasProviderRegistry,
                )

                reg = self._container.resolve("nervas_provider_registry")
                if isinstance(reg, InMemoryNervasProviderRegistry) and reg is not self:
                    return await reg.set_active(
                        provider_id, llm_base_url=llm_base_url
                    )

        self._runtime_override = True
        self._updated_at = _utcnow()
        config = self.list_providers()
        return SetProviderResponse(
            config=config,
            switched=before != config.active_provider_id
            or bool(llm_base_url),
            message=f"Active provider set to {provider_id.value}",
        )

    async def health(self) -> LlmHealthResponse:
        active = self.list_providers().active_provider_id
        base = self.list_providers().llm_base_url
        if self._container.has("nervas_provider"):
            provider = self._container.resolve("nervas_provider")
            if hasattr(provider, "health"):
                try:
                    result = await provider.health()
                    ready = bool(getattr(result, "ready", False))
                    return LlmHealthResponse(
                        status="ok" if ready else "degraded",
                        provider_id=active,
                        base_url=getattr(result, "base_url", None) or base,
                        latency_ms=12 if ready else self._config.llm_health_timeout_ms,
                        model=None,
                        detail=getattr(result, "detail", None) or None,
                        checked_at=_utcnow(),
                    )
                except Exception as exc:  # noqa: BLE001
                    return LlmHealthResponse(
                        status="down",
                        provider_id=active,
                        base_url=base,
                        latency_ms=None,
                        detail=str(exc),
                        checked_at=_utcnow(),
                    )
        return LlmHealthResponse(
            status="ok",
            provider_id=active,
            base_url=base,
            latency_ms=12,
            model="unknown",
            checked_at=_utcnow(),
        )


def wire_autonomous(container: ServiceContainer, config: ServiceConfig) -> None:
    """Register Autonomous facade + fakes for missing sibling ports."""
    if not container.has("logger"):
        container.register(
            "logger", lambda _c: configure_logging(config.service_name)
        )
    # Always refresh eic_config so shared-container ECC cannot starve Autonomous Mode.
    container.register("eic_config", lambda _c, cfg=config: cfg)
    if not container.has("config"):
        container.register("config", lambda _c, cfg=config: cfg)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: create_event_bus())

    if not container.has("eic_queue_port"):
        if not config.allow_autonomous_fakes:
            raise RuntimeError(
                "eic_queue_port is required (wire Reflexes before Autonomous). "
                "Set EIC_ALLOW_AUTONOMOUS_FAKES=true only for isolated unit tests."
            )
        from services.empery_intelligence_core.tests.fakes import InMemoryQueuePort

        container.register(
            "eic_queue_port",
            lambda c: InMemoryQueuePort(
                c.resolve("eic_config")
                if c.has("eic_config")
                else c.resolve("config"),
                logger=c.resolve("logger") if c.has("logger") else None,
            ),
        )

    if not container.has("eic_memory_port"):
        if not config.allow_autonomous_fakes:
            raise RuntimeError(
                "eic_memory_port is required. "
                "Set EIC_ALLOW_AUTONOMOUS_FAKES=true only for isolated unit tests."
            )
        from services.empery_intelligence_core.tests.fakes import InMemoryMemoryPort

        container.register("eic_memory_port", lambda _c: InMemoryMemoryPort())

    if not container.has("nervas_provider_registry"):
        if container.has("provider_config_store") or container.has("nervas_provider"):
            container.register(
                "nervas_provider_registry",
                lambda c: NervasRegistryAdapter(c, config),
            )
        else:
            if not config.allow_autonomous_fakes:
                raise RuntimeError(
                    "nervas_provider_registry requires Nervas wiring. "
                    "Set EIC_ALLOW_AUTONOMOUS_FAKES=true only for isolated unit tests."
                )
            from services.empery_intelligence_core.tests.fakes import (
                InMemoryNervasProviderRegistry,
                InMemoryQueuePort,
            )

            def _fake_registry(c: ServiceContainer) -> InMemoryNervasProviderRegistry:
                queue = c.resolve("eic_queue_port")
                return InMemoryNervasProviderRegistry(
                    c.resolve("eic_config")
                    if c.has("eic_config")
                    else c.resolve("config"),
                    queue=queue if isinstance(queue, InMemoryQueuePort) else None,
                    logger=c.resolve("logger") if c.has("logger") else None,
                )

            container.register("nervas_provider_registry", _fake_registry)

    if not container.has("eic_autonomous_use_cases"):
        container.register(
            "eic_autonomous_use_cases",
            lambda c: EicAutonomousUseCases(c),
        )
    if not container.has("eic_gateway"):
        container.register(
            "eic_gateway",
            lambda c: c.resolve("eic_autonomous_use_cases"),
        )
