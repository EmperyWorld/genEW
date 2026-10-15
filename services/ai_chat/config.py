"""Environment-specific configuration for ai_chat."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _csv_env(key: str, default: str) -> list[str]:
    raw = os.environ.get(key, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


def _database_url() -> str:
    return os.environ.get(
        "AI_CHAT_DATABASE_URL",
        os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://eworld:eworld@localhost:5432/ai_chat",
        ),
    )


class ServiceConfig(BaseModel):
    """Immutable runtime configuration."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "ai_chat"
    host: str = "0.0.0.0"
    port: int = 8035
    log_level: str = "INFO"
    database_url: str = Field(
        default="postgresql+psycopg://eworld:eworld@localhost:5432/ai_chat",
        description="SQLAlchemy/Alembic database URL",
    )
    auto_create_tables: bool = Field(
        default=False,
        description="create_all for sqlite/tests only; Postgres uses Alembic",
    )
    eic_api_base: str = Field(
        default="http://127.0.0.1:8007",
        description="EIC HTTP base for Nervas chat",
    )
    identity_base_url: str = Field(
        default="http://127.0.0.1:8003",
        description="Identity introspect base",
    )
    identity_mode: str = Field(
        default="http",
        description="Identity verification mode: http | container",
    )
    nervas_timeout_seconds: float = 180.0
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
            "http://127.0.0.1:5175",
            "http://localhost:5175",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
    )


@lru_cache
def get_config() -> ServiceConfig:
    return ServiceConfig(
        host=_env("AI_CHAT_HOST", "0.0.0.0"),
        port=int(_env("AI_CHAT_PORT", _env("PORT", "8035"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        database_url=_database_url(),
        auto_create_tables=_env("AUTO_CREATE_TABLES", "false").lower()
        in {"1", "true", "yes"},
        eic_api_base=_env("EIC_API_BASE", "http://127.0.0.1:8007").strip().rstrip("/"),
        identity_base_url=_env(
            "IDENTITY_API_BASE",
            _env("IDENTITY_BASE_URL", "http://127.0.0.1:8003"),
        )
        .strip()
        .rstrip("/"),
        identity_mode=_env("IDENTITY_MODE", "http"),
        nervas_timeout_seconds=float(_env("AI_CHAT_NERVAS_TIMEOUT", "180")),
        cors_origins=_csv_env(
            "AI_CHAT_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174,"
            "http://127.0.0.1:5175,http://localhost:5175,"
            "http://127.0.0.1:5173,http://localhost:5173,"
            "http://192.168.1.136:5173,http://192.168.1.136:5174,"
            "http://192.168.1.136:5175,http://192.168.8.10:5173,"
            "http://192.168.8.10:5174,http://192.168.8.10:5175",
        ),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
