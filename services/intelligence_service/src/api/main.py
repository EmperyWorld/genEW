"""FastAPI entry point and registry registration for intelligence_service."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.data.database import DatabaseManager, register_sqlite_fk_pragma
from core.event_bus import (
    EventBus,
    create_event_bus,
    ensure_event_bus_started,
    ensure_event_bus_stopped,
)
from core.logging import configure_logging, log_event
from core.registry import (
    GlobalServiceRegistry,
    ServiceManifest,
    register_service_database_manager,
    resolve_service_database_manager,
)
from services.intelligence_service.config import ServiceConfig, get_config
from services.intelligence_service.src.api.routes import router
from services.intelligence_service.src.core.use_cases import IntelligenceUseCases
from services.intelligence_service.src.data.orm import Base
from services.intelligence_service.src.data.repository import InsightRepository
from services.intelligence_service.src.integration.ai_insight import (
    IntelligenceAIProvider,
)
from services.intelligence_service.src.integration.postgres import PostgresAdapter


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _wire_dependencies(container: ServiceContainer, config: ServiceConfig) -> None:
    """Register service-local providers into the shared ServiceContainer."""
    logger = configure_logging(config.service_name)
    container.register("logger", lambda _c: logger)
    container.register("config", lambda _c: config)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: create_event_bus())

    register_service_database_manager(
        container, config.service_name, config.database_url
    )
    svc = config.service_name

    container.register(
        "postgres_adapter",
        lambda c: PostgresAdapter(
            c.resolve("config"),
            resolve_service_database_manager(c, svc),
            c.resolve("logger"),
        ),
    )

    def _ai_factory(c: ServiceContainer):
        cfg: ServiceConfig = c.resolve("config")
        log = c.resolve("logger")
        if cfg.use_fake_ai:
            raise RuntimeError(
                "INTELLIGENCE_USE_FAKE_AI is forbidden on the production path. "
                "Register FakeAIProvider from tests/fakes in unit tests only."
            )
        return IntelligenceAIProvider(cfg, log)

    if not container.has("ai_provider"):
        container.register("ai_provider", _ai_factory)
    container.register(
        "insight_repository",
        lambda c: InsightRepository(
            resolve_service_database_manager(c, svc),
            c.resolve("logger"),
        ),
    )
    container.register(
        "intelligence_use_cases",
        lambda c: IntelligenceUseCases(c),
    )


async def _bootstrap_database(
    container: ServiceContainer,
    config: ServiceConfig,
) -> None:
    """Prepare schema for local/dev/test runs."""
    db: DatabaseManager = resolve_service_database_manager(
        container, config.service_name
    )
    logger = container.resolve("logger")

    if config.database_url.startswith("sqlite"):
        register_sqlite_fk_pragma(db.engine)

    if config.auto_create_tables or config.database_url.startswith("sqlite"):
        db.create_all(Base.metadata)
        log_event(
            logger,
            event="intelligence.db.schema_ready",
            message="Database schema ensured via create_all",
        )


def _subscribe_event_handlers(
    container: ServiceContainer,
    config: ServiceConfig,
) -> None:
    """Wire Event Bus subscribers after DI and DB bootstrap."""
    bus: EventBus = container.resolve("event_bus")
    use_cases: IntelligenceUseCases = container.resolve("intelligence_use_cases")
    bus.subscribe("task.created", use_cases.handle_task_created)
    if config.subscribe_task_updated:
        bus.subscribe("task.updated", use_cases.handle_task_updated)
    log_event(
        container.resolve("logger"),
        event="intelligence.event.subscribed",
        message="Subscribed to task lifecycle topics",
        subscribe_task_updated=config.subscribe_task_updated,
    )



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
        await _bootstrap_database(app.state.container, runtime_config)
        _subscribe_event_handlers(app.state.container, runtime_config)
        await ensure_event_bus_started(app.state.container.resolve("event_bus"))
        log_event(
            app.state.container.resolve("logger"),
            event="intelligence.app.startup",
            message="intelligence_service started",
        )
        try:
            yield
        finally:
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))
            db: DatabaseManager = resolve_service_database_manager(
                app.state.container, runtime_config.service_name
            )
            db.dispose()
            log_event(
                app.state.container.resolve("logger"),
                event="intelligence.app.shutdown",
                message="intelligence_service stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="EWorld intelligence AI task-insight service",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    register_standard_error_handlers(
        app,
        service_prefix="INTELLIGENCE",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    """Register this service in the Global Service Registry."""
    config = get_config()
    registry.register_database_manager(
        config.database_url, service_name=config.service_name
    )
    registry.register(load_manifest(), create_app)


def run() -> None:
    """Uvicorn entry for standalone local development."""
    import uvicorn

    config = get_config()
    uvicorn.run(
        "services.intelligence_service.src.api.main:create_app",
        factory=True,
        host=config.host,
        port=config.port,
        log_level=config.log_level.lower(),
    )


if __name__ == "__main__":
    run()
