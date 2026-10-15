"""FastAPI entry + registry registration for empery_deploy_agent."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.logging import configure_logging, log_event
from core.registry import GlobalServiceRegistry, ServiceManifest

from services.empery_deploy_agent.config import ServiceConfig, get_config
from services.empery_deploy_agent.src.api.routes import router
from services.empery_deploy_agent.src.integration.compose_runner import ComposeRunner


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def register(registry: GlobalServiceRegistry) -> None:
    """Register this module in the Global Service Registry."""
    registry.register(load_manifest(), create_app)


def create_app(
    container: ServiceContainer | None = None,
    config: ServiceConfig | None = None,
) -> FastAPI:
    runtime_config = config or get_config()
    app_container = container or ServiceContainer()
    logger = configure_logging(runtime_config.service_name)
    runner = ComposeRunner(runtime_config, logger)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        log_event(
            logger,
            event="deploy_agent.startup",
            message="Deploy agent starting",
            workspace=runtime_config.host_workspace,
            container_host=runtime_config.container_host,
            socket_ok=runner.socket_ok(),
        )
        yield
        log_event(
            logger,
            event="deploy_agent.shutdown",
            message="Deploy agent stopping",
        )

    app = FastAPI(
        title="Empery Deploy Agent",
        version=load_manifest().version,
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.config = runtime_config
    app.state.runner = runner
    register_standard_error_handlers(
        app,
        service_prefix="DEPLOY_AGENT",
        service_name=runtime_config.service_name,
    )
    app.include_router(router)
    return app
