"""Configuration for desktop_shell."""

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
        "DESKTOP_SHELL_DATABASE_URL",
        os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://eworld:eworld@localhost:5432/desktop_shell",
        ),
    )


class ServiceConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    service_name: str = Field(default="desktop_shell")
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8020)
    log_level: str = Field(default="INFO")
    database_url: str = Field(
        default="postgresql+psycopg://eworld:eworld@localhost:5432/desktop_shell",
        description="SQLAlchemy/Alembic database URL",
    )
    auto_create_tables: bool = Field(
        default=False,
        description="create_all for sqlite/tests only; Postgres uses Alembic",
    )
    catalog_dir: str = Field(
        default="/app/desktop_catalog",
        description="Directory of scaffolded *.json catalog overlays",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
            "http://127.0.0.1:5175",
            "http://localhost:5175",
            "http://192.168.1.136:5174",
            "http://192.168.1.136:5175",
            "http://192.168.8.10:5174",
            "http://192.168.8.10:5175",
        ],
        description="Browser origins allowed to call the shell API",
    )


@lru_cache
def get_config() -> ServiceConfig:
    return ServiceConfig(
        host=_env("DESKTOP_SHELL_HOST", "0.0.0.0"),
        port=int(_env("DESKTOP_SHELL_PORT", _env("PORT", "8020"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        database_url=_database_url(),
        auto_create_tables=_env("AUTO_CREATE_TABLES", "false").lower()
        in {"1", "true", "yes"},
        catalog_dir=_env(
            "DESKTOP_CATALOG_DIR",
            "/app/desktop_catalog",
        ).strip(),
        cors_origins=_csv_env(
            "DESKTOP_SHELL_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174,"
            "http://127.0.0.1:5175,http://localhost:5175,"
            "http://192.168.1.136:5174,http://192.168.1.136:5175,"
            "http://192.168.8.10:5174,http://192.168.8.10:5175",
        ),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
