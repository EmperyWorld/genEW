"""FastAPI entry point and registry registration for dedmoroz."""

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
from services.dedmoroz.config import ServiceConfig, get_config
from services.dedmoroz.src.api.routes import router
from services.dedmoroz.src.core.use_cases import DedmorozUseCases
from services.dedmoroz.src.data.orm import Base
from services.dedmoroz.src.data.repository import ChatMessageRepository
from services.dedmoroz.src.integration.identity_adapter import IdentityVerifierAdapter
from services.dedmoroz.src.integration.nervas_client import NervasClient


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _make_event_bus() -> EventBus | RedisEventBus:
    """Prefer Redis bus in compose; in-memory only when Redis URL absent (local tests)."""
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
        "chat_store",
        lambda c: ChatMessageRepository(
            resolve_service_database_manager(c, svc),
        ),
    )
    container.register(
        "nervas_client",
        lambda _c, cfg=config: NervasClient(
            cfg.eic_api_base,
            timeout_seconds=cfg.nervas_timeout_seconds,
        ),
    )
    if not container.has("identity_verifier"):
        container.register(
            "identity_verifier",
            lambda c: IdentityVerifierAdapter(
                mode=c.resolve("config").identity_mode,
                container=c,
                base_url=c.resolve("config").identity_base_url,
                logger=c.resolve("logger"),
            ),
        )
    container.register(
        "service_use_cases",
        lambda c: DedmorozUseCases(c),
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
            event="dedmoroz.db.schema_ready",
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
        log_event(
            app.state.container.resolve("logger"),
            event="dedmoroz.app.startup",
            message="dedmoroz started",
            port=runtime_config.port,
            eic_api_base=runtime_config.eic_api_base,
        )
        try:
            yield
        finally:
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))
            log_event(
                app.state.container.resolve("logger"),
                event="dedmoroz.app.shutdown",
                message="dedmoroz stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="Ded Moroz companion chat via EIC Nervas + identity",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="DEDMOROZ",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    """Register this service in the Global Service Registry."""
    registry.register(load_manifest(), create_app)
