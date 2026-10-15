"""FastAPI entry point and registry registration for identity_service."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.cors import apply_lab_cors
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
from services.identity_service.config import ServiceConfig, get_config
from services.identity_service.src.api.middleware import (
    SlidingWindowRateLimitMiddleware,
)
from services.identity_service.src.api.routes import router
from services.identity_service.src.core.roles import (
    ROLE_ADMIN,
)
from services.identity_service.src.core.use_cases import IdentityUseCases
from services.identity_service.src.data.jwt_service import IdentityTokenService
from services.identity_service.src.data.orm import Base
from services.identity_service.src.data.repository import IdentityRepository
from services.identity_service.src.integration.postgres import PostgresAdapter


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
        "identity_repository",
        lambda c: IdentityRepository(
            resolve_service_database_manager(c, svc),
            c.resolve("logger"),
        ),
    )
    container.register(
        "identity_token_service",
        lambda c: IdentityTokenService(
            c.resolve("config"),
            c.resolve("logger"),
        ),
    )
    # Alias for Trinity consumers (task_orchestrator resolves identity_verifier).
    container.register(
        "identity_verifier",
        lambda c: c.resolve("identity_token_service"),
    )
    container.register(
        "identity_use_cases",
        lambda c: IdentityUseCases(c),
    )


async def _bootstrap_database(container: ServiceContainer, config: ServiceConfig) -> None:
    """Prepare schema, default roles, and optional demo admin for local/test runs."""
    db: DatabaseManager = resolve_service_database_manager(container, config.service_name)
    logger = container.resolve("logger")

    if config.database_url.startswith("sqlite"):
        register_sqlite_fk_pragma(db.engine)

    if config.auto_create_tables or config.database_url.startswith("sqlite"):
        db.create_all(Base.metadata)
        log_event(
            logger,
            event="identity.db.schema_ready",
            message="Database schema ensured via create_all",
        )

    repo: IdentityRepository = container.resolve("identity_repository")
    await repo.ensure_default_roles()

    if await repo.count_users() == 0:
        password = config.seed_operator_password
        email = config.seed_operator_email
        display_name = config.seed_operator_display_name
        if not password and config.seed_demo_user:
            log_event(
                logger,
                event="identity.repo.seed_refused",
                message=(
                    "SEED_DEMO_USER is removed from the production path. "
                    "Set SEED_OPERATOR_PASSWORD (and optional SEED_OPERATOR_EMAIL) "
                    "to bootstrap an empty users table, or register via API/UI."
                ),
                level=logging.WARNING,
            )
        if password:
            if len(password) < 8:
                log_event(
                    logger,
                    event="identity.repo.seed_refused",
                    message="SEED_OPERATOR_PASSWORD must be at least 8 characters",
                    level=logging.WARNING,
                )
            else:
                await repo.create_user(
                    email=email,
                    password=password,
                    display_name=display_name,
                    role_name=ROLE_ADMIN,
                )
                log_event(
                    logger,
                    event="identity.repo.seed",
                    message="Seeded identity operator from SEED_OPERATOR_PASSWORD",
                    email=email,
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
            event="identity.app.startup",
            message="identity_service started",
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
                event="identity.app.shutdown",
                message="identity_service stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="EWorld identity authority service (users, roles, JWT)",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    if runtime_config.rate_limit_per_minute > 0:
        app.add_middleware(
            SlidingWindowRateLimitMiddleware,
            limit_per_minute=runtime_config.rate_limit_per_minute,
        )
    register_standard_error_handlers(
        app,
        service_prefix="IDENTITY",
        service_name=runtime_config.service_name,
    )
    app.include_router(router, prefix="/api/v1")
    return app


def register(registry: GlobalServiceRegistry) -> None:
    """Register this service in the Global Service Registry."""
    try:
        config = get_config()
    except ValueError as exc:
        logging.getLogger("identity_service").error(
            "identity_service config validation failed: %s",
            exc,
            extra={"event": "identity.app.config_invalid"},
        )
        raise
    registry.register_database_manager(
        config.database_url, service_name=config.service_name
    )
    registry.register(load_manifest(), create_app)


def run() -> None:
    """Uvicorn entry for standalone local development."""
    import uvicorn

    try:
        config = get_config()
    except ValueError as exc:
        logging.getLogger("identity_service").error(
            "identity_service refused to start: %s",
            exc,
            extra={"event": "identity.app.config_invalid"},
        )
        raise SystemExit(1) from exc
    uvicorn.run(
        "services.identity_service.src.api.main:create_app",
        factory=True,
        host=config.host,
        port=config.port,
        log_level=config.log_level.lower(),
    )


if __name__ == "__main__":
    run()
