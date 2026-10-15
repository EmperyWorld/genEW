"""FastAPI entry point and registry registration for empery_intelligence_core."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.cors import apply_lab_cors
from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.event_bus import (
    create_event_bus,
    ensure_event_bus_started,
    ensure_event_bus_stopped,
)
from core.integration.nervas import NervasBackendId
from core.logging import configure_logging, log_event
from core.registry import GlobalServiceRegistry, ServiceManifest
from services.empery_intelligence_core.config import ServiceConfig, get_config
from services.empery_intelligence_core.src.api.autonomous_routes import (
    router as autonomous_router,
)
from services.empery_intelligence_core.src.api.routes_engine import (
    router as engine_router,
)
from services.empery_intelligence_core.src.api.routes_evolve import (
    router as evolve_router,
)
from services.empery_intelligence_core.src.api.routes_factory import (
    router as factory_router,
)
from services.empery_intelligence_core.src.api.routes_memory import (
    router as memory_router,
)
from services.empery_intelligence_core.src.api.routes_nervas import (
    router as nervas_router,
)
from services.empery_intelligence_core.src.api.routes_reflexes import (
    router as reflexes_router,
)
from services.empery_intelligence_core.src.api.wire_autonomous import wire_autonomous
from services.empery_intelligence_core.src.api.wire_memory import (
    bootstrap_memory,
    wire_memory,
)
from services.empery_intelligence_core.src.api.wire_reflexes import (
    start_worker,
    stop_worker,
    wire_reflexes,
)
from services.empery_intelligence_core.src.core.engine.cycle_runner import (
    HeadlessExecutionEngine,
)
from services.empery_intelligence_core.src.core.engine.contracts import (
    InMemoryIntentionSource,
)
from services.empery_intelligence_core.src.core.engine.prompt_loader import (
    FilesystemRolePromptLoader,
)
from services.empery_intelligence_core.src.core.engine.use_cases import (
    HeadlessEngineUseCases,
)
from services.empery_intelligence_core.src.core.nervas.router import NervasRouter
from services.empery_intelligence_core.src.core.nervas.use_cases import NervasUseCases
from services.empery_intelligence_core.src.data.provider_config_store import (
    FileProviderConfigStore,
    NervasRuntimeConfigUpdate,
)
from services.empery_intelligence_core.src.integration.ai_provider_adapter import (
    NervasAIProviderAdapter,
)
from services.empery_intelligence_core.src.integration.anthropic_adapter import (
    AnthropicNervasProvider,
)
from services.empery_intelligence_core.src.integration.llama_cpp import (
    LlamaCppNervasProvider,
)
from services.empery_intelligence_core.src.integration.openai_adapter import (
    OpenAINervasProvider,
)
from services.empery_intelligence_core.src.integration.evolve_propose import (
    EvolveProposeUseCases,
)


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _wire_nervas(container: ServiceContainer, config: ServiceConfig) -> None:
    """Architect 1 — Nervas provider + headless engine DI."""
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: create_event_bus())

    # Capture EIC config in closures — never re-resolve shared "config" at call time.
    container.register(
        "provider_config_store",
        lambda c, cfg=config: FileProviderConfigStore(cfg, c.resolve("logger")),
    )
    container.register(
        "nervas_runtime_config",
        lambda c: c.resolve("provider_config_store").get(),
    )
    container.register(
        "nervas_llama",
        lambda c, cfg=config: LlamaCppNervasProvider(
            cfg,
            c.resolve("provider_config_store"),
            c.resolve("logger"),
        ),
    )
    container.register(
        "nervas_openai",
        lambda c, cfg=config: OpenAINervasProvider(
            cfg,
            c.resolve("provider_config_store"),
            c.resolve("logger"),
        ),
    )
    container.register(
        "nervas_anthropic",
        lambda c, cfg=config: AnthropicNervasProvider(
            cfg,
            c.resolve("provider_config_store"),
            c.resolve("logger"),
        ),
    )
    def _nervas_router_factory(
        c: ServiceContainer, cfg: ServiceConfig = config
    ) -> NervasRouter:
        if cfg.use_fake_nervas:
            raise RuntimeError(
                "EIC_USE_FAKE_NERVAS is forbidden on the production path. "
                "Unit tests must pre-register nervas_fake from tests/fakes."
            )
        backends = {
            NervasBackendId.LOCAL_LLAMA: c.resolve("nervas_llama"),
            NervasBackendId.OPENAI: c.resolve("nervas_openai"),
            NervasBackendId.ANTHROPIC: c.resolve("nervas_anthropic"),
        }
        store = c.resolve("provider_config_store")
        # Test injection only — never import tests.fakes from runtime src.
        if c.has("nervas_fake"):
            backends[NervasBackendId.FAKE] = c.resolve("nervas_fake")
            if store.get().active_backend != NervasBackendId.FAKE:
                store.update(
                    NervasRuntimeConfigUpdate(
                        active_backend=NervasBackendId.FAKE,
                        source="runtime_override",
                    )
                )
        return NervasRouter(
            store,
            backends,
            c.resolve("event_bus"),
            c.resolve("logger"),
            fallback_local=bool(getattr(cfg, "nervas_fallback_local", False)),
        )

    container.register("nervas_provider", _nervas_router_factory)

    def _ai_provider_factory(c: ServiceContainer) -> NervasAIProviderAdapter:
        return NervasAIProviderAdapter(
            c.resolve("nervas_provider"),
            c.resolve("logger"),
        )

    if not container.has("ai_provider"):
        container.register("ai_provider", _ai_provider_factory)
    container.register("eic_ai_provider", _ai_provider_factory)

    container.register(
        "role_prompt_loader",
        lambda _c, cfg=config: FilesystemRolePromptLoader(
            cfg.workspace_root,
            agents_root=cfg.agents_root,
            skills_root=cfg.skills_root,
        ),
    )
    if not container.has("intention_source"):
        container.register(
            "intention_source",
            lambda _c: InMemoryIntentionSource(),
        )
    container.register(
        "headless_engine",
        lambda c, cfg=config: HeadlessExecutionEngine(
            c.resolve("nervas_provider"),
            c.resolve("role_prompt_loader"),
            c.resolve("intention_source"),
            c.resolve("event_bus"),
            cfg,
            c.resolve("logger"),
        ),
    )
    container.register("nervas_use_cases", lambda c: NervasUseCases(c))
    container.register(
        "evolve_propose_use_cases",
        lambda c, cfg=config: EvolveProposeUseCases(
            workspace=Path(cfg.workspace_root),
            nervas_use_cases=c.resolve("nervas_use_cases"),
            logger=c.resolve("logger"),
        ),
    )
    container.register("engine_use_cases", lambda c: HeadlessEngineUseCases(c))


def _wire_dependencies(container: ServiceContainer, config: ServiceConfig) -> None:
    """Register service-local providers into the shared ServiceContainer."""
    logger = configure_logging(config.service_name)
    # Dedicated key survives ECC registering its own "config" on the shared container.
    container.register("eic_config", lambda _c, cfg=config: cfg)
    container.register("eic_logger", lambda _c, log=logger: log)
    if not container.has("logger"):
        container.register("logger", lambda _c, log=logger: log)
    # Keep "config" for standalone EIC; ECC may overwrite on shared registry.
    if not container.has("config"):
        container.register("config", lambda _c, cfg=config: cfg)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: create_event_bus())

    # Nervas must register before Reflexes (no silent FakeNervasStub in prod).
    _wire_nervas(container, config)

    # --- MEMORY WIRING ---
    wire_memory(container, config)
    # --- END MEMORY WIRING ---

    # --- REFLEXES WIRING ---
    wire_reflexes(container, config)
    # --- END REFLEXES WIRING ---

    # --- AUTONOMOUS WIRING ---
    wire_autonomous(container, config)
    if not container.has("eic_gateway"):
        container.register(
            "eic_gateway",
            lambda c: c.resolve("eic_autonomous_use_cases"),
        )
    # --- END AUTONOMOUS WIRING ---


def create_app(
    container: ServiceContainer | None = None,
    config: ServiceConfig | None = None,
) -> FastAPI:
    """Build the FastAPI application for this service."""
    runtime_config = config or get_config()
    app_container = container or ServiceContainer()
    _wire_dependencies(app_container, runtime_config)
    manifest = load_manifest()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # --- MEMORY WIRING ---
        bootstrap_memory(app.state.container, runtime_config)
        # --- END MEMORY WIRING ---
        # --- REFLEXES WIRING ---
        await start_worker(app.state.container, runtime_config)
        # --- END REFLEXES WIRING ---
        await ensure_event_bus_started(app.state.container.resolve("event_bus"))
        log_event(
            app.state.container.resolve("logger"),
            event="eic.app.startup",
            message="empery_intelligence_core started",
            port=runtime_config.port,
            nervas_backend=runtime_config.nervas_backend.value,
        )
        try:
            yield
        finally:
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))
            # --- REFLEXES WIRING ---
            await stop_worker(app.state.container)
            # --- END REFLEXES WIRING ---
            from core.registry import database_manager_key

            db_key = database_manager_key(runtime_config.service_name)
            if app.state.container.has(db_key):
                app.state.container.resolve(db_key).dispose()
            log_event(
                app.state.container.resolve("logger"),
                event="eic.app.shutdown",
                message="empery_intelligence_core stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="Empery Intelligence Core — Nervas, Reflexes, Memory, Autonomous Mode",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="EIC",
        service_name=runtime_config.service_name,
        validation_error_code="NERVAS_VALIDATION_ERROR",
        internal_error_code="EIC_INTERNAL_ERROR",
    )
    app.include_router(nervas_router, prefix="/api/v1")
    app.include_router(engine_router, prefix="/api/v1")
    app.include_router(factory_router, prefix="/api/v1")
    app.include_router(evolve_router, prefix="/api/v1")
    app.include_router(memory_router)
    app.include_router(reflexes_router, prefix="/api/v1/eic")
    app.include_router(autonomous_router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    """Register this service in the Global Service Registry."""
    config = get_config()
    _wire_dependencies(registry.container, config)
    registry.register(load_manifest(), create_app)


def run() -> None:
    """Uvicorn entry for standalone local development."""
    import uvicorn

    config = get_config()
    uvicorn.run(
        "services.empery_intelligence_core.src.api.main:create_app",
        factory=True,
        host=config.host,
        port=config.port,
        log_level=config.log_level.lower(),
    )


if __name__ == "__main__":
    run()
