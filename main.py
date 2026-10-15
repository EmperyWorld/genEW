"""EWorld orchestration entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from core.logging import configure_logging, log_event
from core.registry import register_all_services, registry


def create_root_app() -> FastAPI:
    """Create the root app that exposes registered services."""
    register_all_services()
    logger = configure_logging("eworld")
    app = FastAPI(title="EWorld", version="0.1.0")
    app.state.registry = registry

    @app.get("/health")
    async def root_health() -> dict:
        return {
            "status": "ok",
            "services": registry.list_services(),
        }

    @app.get("/services")
    async def list_services() -> dict:
        return {
            "services": [
                registry.get_manifest(name).model_dump()
                for name in registry.list_services()
            ]
        }

    log_event(
        logger,
        event="registry.loaded",
        message="Global Service Registry initialized",
        services=registry.list_services(),
    )
    return app


def get_service_app(service_name: str) -> FastAPI:
    """Resolve a registered service application via ServiceContainer."""
    register_all_services()
    return registry.create_app(service_name)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:create_root_app", factory=True, host="0.0.0.0", port=8000)
