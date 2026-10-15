"""FastAPI health + registry registration for empery_assembler."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from core.api.responses import register_standard_error_handlers
from core.container import ServiceContainer
from core.logging import configure_logging, log_event
from core.registry import GlobalServiceRegistry, ServiceManifest

from services.empery_assembler.config import ServiceConfig, get_config


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

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        log_event(
            logger,
            event="empery_assembler.health_startup",
            message="Assembler health HTTP starting",
            grpc_port=runtime_config.grpc_port,
            health_port=runtime_config.health_port,
        )
        yield
        log_event(
            logger,
            event="empery_assembler.health_shutdown",
            message="Assembler health HTTP stopping",
        )

    app = FastAPI(
        title="Empery Assembler",
        version=load_manifest().version,
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.config = runtime_config

    register_standard_error_handlers(
        app,
        service_prefix="ASSEMBLER",
        service_name=runtime_config.service_name,
    )

    @app.get("/health")
    def health() -> dict:
        return {
            "status": "ok",
            "service": runtime_config.service_name,
            "grpc_port": runtime_config.grpc_port,
            "transport": "grpc",
            "phase": "sidecar",
        }

    return app
