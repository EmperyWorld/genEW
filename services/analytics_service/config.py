"""Environment-specific configuration for analytics_service."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _database_url() -> str:
    return os.environ.get(
        "ANALYTICS_DATABASE_URL",
        os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://eworld:eworld@localhost:5432/analytics",
        ),
    )


class ServiceConfig(BaseModel):
    """Immutable runtime configuration loaded from the environment."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "analytics_service"
    host: str = "0.0.0.0"
    port: int = 8002
    log_level: str = "INFO"
    database_url: str = Field(
        default="postgresql+psycopg://eworld:eworld@localhost:5432/analytics",
        description="SQLAlchemy/Alembic database URL",
    )
    auto_create_tables: bool = Field(
        default=False,
        description=(
            "Call metadata.create_all on startup "
            "(sqlite/tests; prefer Alembic for Postgres)"
        ),
    )


@lru_cache
def get_config() -> ServiceConfig:
    """Return cached service configuration from environment variables."""
    return ServiceConfig(
        host=_env("ANALYTICS_HOST", "0.0.0.0"),
        port=int(_env("ANALYTICS_PORT", "8002")),
        log_level=_env("LOG_LEVEL", "INFO"),
        database_url=_database_url(),
        auto_create_tables=_env("AUTO_CREATE_TABLES", "false").lower()
        in {"1", "true", "yes"},
    )


def clear_config_cache() -> None:
    """Clear cached config (for tests that mutate environment)."""
    get_config.cache_clear()
