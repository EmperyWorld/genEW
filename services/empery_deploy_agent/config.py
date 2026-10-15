"""Configuration for empery_deploy_agent."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, Field


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def _env_bool(key: str, default: bool = False) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class ServiceConfig(BaseModel):
    """Deploy-agent runtime config (fail-closed allowlist)."""

    service_name: str = "empery_deploy_agent"
    host: str = "0.0.0.0"
    port: int = 8010
    log_level: str = "INFO"
    # Host-identical workspace path (required for remote Podman bind resolution).
    host_workspace: str = Field(
        default="",
        description="Absolute host path to the Empery repo (path-identity mount)",
    )
    container_host: str = "unix:///run/podman/podman.sock"
    compose_timeout_s: float = 600.0
    # Per-attempt HTTP timeout; cold containers often need >5s on first probe.
    health_probe_timeout_s: float = 8.0
    # Retries with constant backoff — compose up returns before app listens.
    health_probe_retries: int = 12
    health_probe_backoff_s: float = 2.0
    require_socket: bool = True


@lru_cache
def get_config() -> ServiceConfig:
    workspace = _env("EMPERY_HOST_WORKSPACE") or _env("DEPLOY_AGENT_WORKSPACE")
    return ServiceConfig(
        host=_env("DEPLOY_AGENT_HOST", "0.0.0.0"),
        port=int(_env("DEPLOY_AGENT_PORT", _env("PORT", "8010")) or "8010"),
        log_level=_env("LOG_LEVEL", "INFO"),
        host_workspace=workspace,
        container_host=_env(
            "CONTAINER_HOST",
            _env("DOCKER_HOST", "unix:///run/podman/podman.sock"),
        ),
        compose_timeout_s=float(_env("DEPLOY_AGENT_COMPOSE_TIMEOUT_S", "600")),
        health_probe_timeout_s=float(_env("DEPLOY_AGENT_HEALTH_TIMEOUT_S", "8")),
        health_probe_retries=int(_env("DEPLOY_AGENT_HEALTH_RETRIES", "12") or "12"),
        health_probe_backoff_s=float(
            _env("DEPLOY_AGENT_HEALTH_BACKOFF_S", "2.0") or "2.0"
        ),
        require_socket=_env_bool("DEPLOY_AGENT_REQUIRE_SOCKET", True),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
