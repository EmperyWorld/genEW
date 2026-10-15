"""Configuration for site_studio."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _csv_env(key: str, default: str) -> list[str]:
    raw = os.environ.get(key, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


class ServiceConfig(BaseModel):
    service_name: str = Field(default="site_studio")
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8024)
    log_level: str = Field(default="INFO")
    eic_api_base: str = Field(
        default="http://127.0.0.1:8007",
        description="EIC HTTP base for Nervas (EIC_API_BASE)",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ],
    )
    nervas_timeout_seconds: float = Field(default=180.0)
    max_tokens: int = Field(default=4096, ge=256, le=16384)


@lru_cache
def get_config() -> ServiceConfig:
    return ServiceConfig(
        host=_env("SITE_STUDIO_HOST", "0.0.0.0"),
        port=int(_env("SITE_STUDIO_PORT", _env("PORT", "8024"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        eic_api_base=_env("EIC_API_BASE", "http://127.0.0.1:8007").strip().rstrip("/"),
        cors_origins=_csv_env(
            "SITE_STUDIO_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174",
        ),
        nervas_timeout_seconds=float(_env("SITE_STUDIO_NERVAS_TIMEOUT", "180")),
        max_tokens=int(_env("SITE_STUDIO_MAX_TOKENS", "4096")),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
