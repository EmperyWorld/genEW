"""Configuration for empery_assembler gRPC sidecar."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def _env_bool(key: str, default: bool = False) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class ServiceConfig(BaseModel):
    """Assembler sidecar runtime config."""

    service_name: str = "empery_assembler"
    grpc_host: str = "127.0.0.1"
    grpc_port: int = 50051
    health_host: str = "127.0.0.1"
    health_port: int = 8011
    log_level: str = "INFO"
    workspace_root: str = Field(
        default="",
        description="Default monorepo root when DesignRequest.workspace_root is empty",
    )
    max_workers: int = 4
    enable_health_http: bool = True


@lru_cache
def get_config() -> ServiceConfig:
    workspace = (
        _env("EMPERY_HOST_WORKSPACE")
        or _env("ASSEMBLER_WORKSPACE")
        or str(Path(__file__).resolve().parents[2])
    )
    return ServiceConfig(
        grpc_host=_env("ASSEMBLER_GRPC_HOST", "127.0.0.1"),
        grpc_port=int(
            _env("ASSEMBLER_GRPC_PORT", _env("GRPC_PORT", "50051")) or "50051"
        ),
        health_host=_env("ASSEMBLER_HEALTH_HOST", "127.0.0.1"),
        health_port=int(
            _env("ASSEMBLER_HEALTH_PORT", _env("PORT", "8011")) or "8011"
        ),
        log_level=_env("LOG_LEVEL", "INFO"),
        workspace_root=workspace,
        max_workers=int(_env("ASSEMBLER_MAX_WORKERS", "4") or "4"),
        enable_health_http=_env_bool("ASSEMBLER_ENABLE_HEALTH_HTTP", True),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
