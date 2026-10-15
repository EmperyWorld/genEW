"""FastAPI entry point and registry registration for core_auth_service."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.data.database import DatabaseManager, register_sqlite_fk_pragma
from core.event_bus import (
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
from services.core_auth_service.config import ServiceConfig, get_config
from services.core_auth_service.src.api.routes import router
from services.core_auth_service.src.core.use_cases import AuthUseCases
from services.core_auth_service.src.data.orm import Base
from services.core_auth_service.src.data.repository import AuthRepository
from services.core_auth_service.src.integration.ai_chat import CoreAuthAIProvider
from services.core_auth_service.src.integration.postgres import PostgresAdapter


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
    container.register(
        "ai_provider",
        lambda c: CoreAuthAIProvider(c.resolve("config"), c.resolve("logger")),
    )
    # Alias kept for any callers still resolving the scaffold name.
    container.register(
        "ai_chat_adapter",
        lambda c: c.resolve("ai_provider"),
    )
    container.register(
        "auth_repository",
        lambda c: AuthRepository(
            resolve_service_database_manager(c, svc), c.resolve("logger")
        ),
    )
    container.register(
        "auth_use_cases",
        lambda c: AuthUseCases(c),
    )


async def _bootstrap_database(container: ServiceContainer, config: ServiceConfig) -> None:
    """Prepare schema and optional demo user for local/dev/test runs."""
    db: DatabaseManager = resolve_service_database_manager(container, config.service_name)
    logger = container.resolve("logger")

    if config.database_url.startswith("sqlite"):
        register_sqlite_fk_pragma(db.engine)

    if config.auto_create_tables or config.database_url.startswith("sqlite"):
        db.create_all(Base.metadata)
        log_event(
            logger,
            event="auth.db.schema_ready",
            message="Database schema ensured via create_all",
        )

    if config.seed_demo_user:
        log_event(
            logger,
            event="auth.repo.seed_refused",
            message=(
                "SEED_DEMO_USER is removed from core_auth production path. "
                "Use identity_service SEED_OPERATOR_PASSWORD or register via API."
            ),
            level=logging.WARNING,
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
        await ensure_event_bus_started(app.state.container.resolve("event_bus"))
        log_event(
            app.state.container.resolve("logger"),
            event="auth.app.startup",
            message="core_auth_service started",
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
                event="auth.app.shutdown",
                message="core_auth_service stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="EWorld core authentication service",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    register_standard_error_handlers(
        app,
        service_prefix="AUTH",
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
        "services.core_auth_service.src.api.main:create_app",
        factory=True,
        host=config.host,
        port=config.port,
        log_level=config.log_level.lower(),
    )


if __name__ == "__main__":
    run()
