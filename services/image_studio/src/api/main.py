"""FastAPI entry point and registry registration for image_studio."""

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
from core.logging import configure_logging, log_event
from core.registry import GlobalServiceRegistry, ServiceManifest
from services.image_studio.config import ServiceConfig, get_config
from services.image_studio.src.api.routes import router
from services.image_studio.src.core.use_cases import ImageStudioUseCases
from services.image_studio.src.integration.comfy_client import ComfyClient


def _manifest_path() -> Path:
    return Path(__file__).resolve().parents[2] / "manifest.json"


def load_manifest() -> ServiceManifest:
    raw = json.loads(_manifest_path().read_text(encoding="utf-8"))
    return ServiceManifest.model_validate(raw)


def _wire_dependencies(container: ServiceContainer, config: ServiceConfig) -> None:
    logger = configure_logging(config.service_name)
    container.register("logger", lambda _c: logger)
    container.register("config", lambda _c: config)
    if not container.has("event_bus"):
        container.register("event_bus", lambda _c: create_event_bus())
    container.register(
        "comfy_client",
        lambda _c, cfg=config: ComfyClient(
            cfg.comfy_base_url,
            timeout_seconds=cfg.comfy_timeout_seconds,
        ),
    )
    container.register(
        "image_studio_use_cases",
        lambda c: ImageStudioUseCases(c),
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
        bus = app.state.container.resolve("event_bus")
        await ensure_event_bus_started(bus)
        log_event(
            app.state.container.resolve("logger"),
            event="image_studio.app.startup",
            message="image_studio started",
            port=runtime_config.port,
            comfy_base_url=runtime_config.comfy_base_url,
        )
        try:
            yield
        finally:
            await ensure_event_bus_stopped(bus)
            log_event(
                app.state.container.resolve("logger"),
                event="image_studio.app.shutdown",
                message="image_studio stopped",
            )

    app = FastAPI(
        title=manifest.name,
        version=manifest.version,
        description="Empery Image Studio — ComfyUI text-to-image peer",
        lifespan=lifespan,
    )
    app.state.container = app_container
    app.state.manifest = manifest
    app.state.config = runtime_config
    apply_lab_cors(app, getattr(runtime_config, "cors_origins", None))
    register_standard_error_handlers(
        app,
        service_prefix="IMG",
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
        "services.image_studio.src.api.main:create_app",
        factory=True,
        host=config.host,
        port=config.port,
        log_level=config.log_level.lower(),
    )


if __name__ == "__main__":
    run()
