"""Environment-specific configuration for core_auth_service."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


class ServiceConfig(BaseModel):
    """Immutable runtime configuration loaded from the environment."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "core_auth_service"
    host: str = "0.0.0.0"
    port: int = 8001
    log_level: str = "INFO"
    database_url: str = Field(
        default="postgresql+psycopg://eworld:eworld@localhost:5432/core_auth",
        description="SQLAlchemy/Alembic database URL",
    )
    ai_chat_base_url: str = Field(
        default="http://localhost:8080/v1/chat",
        description="External AI chat adapter endpoint",
    )
    ai_chat_api_key: str = Field(default="", description="Optional AI chat API key")
    ai_chat_model: str = Field(default="local-deterministic", description="AI model id")
    seed_demo_user: bool = Field(
        default=False,
        description="Seed admin@eworld.local when the users table is empty (lab: SEED_DEMO_USER=true)",
    )
    auto_create_tables: bool = Field(
        default=False,
        description="Call metadata.create_all on startup (sqlite/tests; prefer Alembic for Postgres)",
    )


@lru_cache
def get_config() -> ServiceConfig:
    """Return cached service configuration from environment variables."""
    return ServiceConfig(
        host=_env("CORE_AUTH_HOST", "0.0.0.0"),
        port=int(_env("CORE_AUTH_PORT", "8001")),
        log_level=_env("LOG_LEVEL", "INFO"),
        database_url=_env(
            "DATABASE_URL",
            "postgresql+psycopg://eworld:eworld@localhost:5432/core_auth",
        ),
        ai_chat_base_url=_env("AI_CHAT_BASE_URL", "http://localhost:8080/v1/chat"),
        ai_chat_api_key=_env("AI_CHAT_API_KEY", ""),
        ai_chat_model=_env("AI_CHAT_MODEL", "local-deterministic"),
        seed_demo_user=_env("SEED_DEMO_USER", "false").lower() in {"1", "true", "yes"},
        auto_create_tables=_env("AUTO_CREATE_TABLES", "false").lower()
        in {"1", "true", "yes"},
    )


def clear_config_cache() -> None:
    """Clear cached config (for tests that mutate environment)."""
    get_config.cache_clear()
