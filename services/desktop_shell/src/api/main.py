"""FastAPI entry point and registry registration for desktop_shell."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.cors import apply_lab_cors
from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.data.database import DatabaseManager, register_sqlite_fk_pragma
from core.event_bus import (
    EventBus,
    RedisEventBus,
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
from services.desktop_shell.config import ServiceConfig, get_config
from services.desktop_shell.src.api.routes import router
from services.desktop_shell.src.core.use_cases import DesktopShellUseCases
from services.desktop_shell.src.data.orm import Base
from services.desktop_shell.src.data.repository import PostgresDesktopShellStore


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _make_event_bus() -> EventBus | RedisEventBus:
    try:
        return create_event_bus()
    except RuntimeError:
        return EventBus()


def _wire_dependencies(container: ServiceContainer, config: ServiceConfig) -> None:
    logger = configure_logging(config.service_name)
    container.register("logger", lambda _c: logger)
    container.register("config", lambda _c: config)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: _make_event_bus())

    register_service_database_manager(
        container, config.service_name, config.database_url
    )
    svc = config.service_name
    container.register(
        "desktop_shell_store",
        lambda c, cfg=config: PostgresDesktopShellStore(
            resolve_service_database_manager(c, svc),
            cfg.catalog_dir,
        ),
    )
    container.register(
        "desktop_shell_use_cases",
        lambda c: DesktopShellUseCases(c),
    )


async def _bootstrap_database(
    container: ServiceContainer,
    config: ServiceConfig,
) -> None:
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
            event="desktop_shell.db.schema_ready",
            message="Database schema ensured via create_all",
        )


def create_app(
    container: ServiceContainer | None = None,
    config: ServiceConfig | None = None,
) -> FastAPI:
    runtime_config = config or get_config()
    app_container = container or ServiceContainer()
    _wire_dependencies(app_container, runtime_config)
    manifest = load_manifest()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await _bootstrap_database(app.state.container, runtime_config)
        await ensure_event_bus_started(app.state.container.resolve("event_bus"))
        uc: DesktopShellUseCases = app.state.container.resolve(
            "desktop_shell_use_cases"
        )
        await uc.publish_shell_bootstrapped()
        log_event(
            app.state.container.resolve("logger"),
            event="desktop_shell.app.startup",
            message="desktop_shell started",
            port=runtime_config.port,
        )
        try:
            yield
        finally:
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))
            log_event(
                app.state.container.resolve("logger"),
                event="desktop_shell.app.shutdown",
                message="desktop_shell stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="Empery desktop shell — bootstrap, items, installed apps",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="DESKTOP",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    registry.register(load_manifest(), create_app)


def run() -> None:
    import uvicorn

    config = get_config()
    uvicorn.run(
        "services.desktop_shell.src.api.main:create_app",
        factory=True,
        host=config.host,
        port=config.port,
        log_level=config.log_level.lower(),
    )


if __name__ == "__main__":
    run()
