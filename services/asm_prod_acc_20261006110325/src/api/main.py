"""FastAPI entry point and registry registration for asm_prod_acc_20261006110325."""

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
    create_event_bus,
    ensure_event_bus_started,
    ensure_event_bus_stopped,
)
from core.logging import configure_logging
from core.registry import (
    GlobalServiceRegistry,
    ServiceManifest,
    register_service_database_manager,
    resolve_service_database_manager,
)
from services.asm_prod_acc_20261006110325.config import ServiceConfig, get_config
from services.asm_prod_acc_20261006110325.src.api.routes import router
from services.asm_prod_acc_20261006110325.src.core.use_cases import AsmProdAcc20261006110325UseCases
from services.asm_prod_acc_20261006110325.src.data.orm import Base
from services.asm_prod_acc_20261006110325.src.data.repository import MetricRepository


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _make_event_bus() -> EventBus:
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
        "metric_repository",
        lambda c: MetricRepository(resolve_service_database_manager(c, svc)),
    )
    container.register("service_use_cases", lambda c: AsmProdAcc20261006110325UseCases(c))


async def _bootstrap_database(
    container: ServiceContainer, config: ServiceConfig
) -> None:
    db: DatabaseManager = resolve_service_database_manager(
        container, config.service_name
    )
    if config.database_url.startswith("sqlite"):
        register_sqlite_fk_pragma(db.engine)
    if config.auto_create_tables or config.database_url.startswith("sqlite"):
        db.create_all(Base.metadata)


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
        try:
            yield
        finally:
            await ensure_event_bus_stopped(app.state.container.resolve("event_bus"))

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="Production domain scaffold for Ops dashboard (Metric)",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="ASM_PROD_ACC_202",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    registry.register(load_manifest(), create_app)
