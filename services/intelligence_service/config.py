"""Environment-specific configuration for intelligence_service."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _database_url() -> str:
    return os.environ.get(
        "INTELLIGENCE_DATABASE_URL",
        os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://eworld:eworld@localhost:5432/intelligence",
        ),
    )


def _bool_env(key: str, default: str) -> bool:
    return _env(key, default).lower() in {"1", "true", "yes"}


class ServiceConfig(BaseModel):
    """Immutable runtime configuration loaded from the environment."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "intelligence_service"
    host: str = "0.0.0.0"
    port: int = 8005
    log_level: str = "INFO"
    database_url: str = Field(
        default="postgresql+psycopg://eworld:eworld@localhost:5432/intelligence",
        description="SQLAlchemy/Alembic database URL",
    )
    auto_create_tables: bool = Field(
        default=False,
        description=(
            "Call metadata.create_all on startup "
            "(sqlite/tests; prefer Alembic for Postgres)"
        ),
    )
    ai_chat_base_url: str = Field(
        default="http://127.0.0.1:8080/v1/chat/completions",
        description="OpenAI-compatible chat completions URL (llama.cpp)",
    )
    ai_chat_api_key: str = Field(
        default="",
        description="Optional Bearer token (llama.cpp typically needs none)",
    )
    ai_chat_model: str = Field(
        default="local",
        description="AI model id passed to the chat endpoint",
    )
    ai_chat_timeout_seconds: float = Field(
        default=60.0,
        description="HTTP timeout for remote AI chat completions",
    )
    ai_chat_max_retries: int = Field(
        default=2,
        description="Retries on transport errors / 502–504 only (0 disables)",
    )
    ai_allow_no_api_key: bool = Field(
        default=True,
        description="Call remote llama/OpenAI-compatible endpoint without API key",
    )
    ai_fallback_to_fake: bool = Field(
        default=False,
        description="On remote failure, fall back to FakeAI (off in production)",
    )
    subscribe_task_updated: bool = Field(
        default=True,
        description="Subscribe to task.updated for optional re-analysis",
    )
    use_fake_ai: bool = Field(
        default=False,
        description="Force FakeAIProvider (tests/CI only)",
    )


@lru_cache
def get_config() -> ServiceConfig:
    """Return cached service configuration from environment variables."""
    return ServiceConfig(
        host=_env("INTELLIGENCE_HOST", "0.0.0.0"),
        port=int(_env("INTELLIGENCE_PORT", "8005")),
        log_level=_env("LOG_LEVEL", "INFO"),
        database_url=_database_url(),
        auto_create_tables=_bool_env("AUTO_CREATE_TABLES", "false"),
        ai_chat_base_url=_env(
            "AI_CHAT_BASE_URL",
            "http://127.0.0.1:8080/v1/chat/completions",
        ),
        ai_chat_api_key=_env("AI_CHAT_API_KEY", ""),
        ai_chat_model=_env("AI_CHAT_MODEL", "local"),
        ai_chat_timeout_seconds=float(_env("AI_CHAT_TIMEOUT_SECONDS", "60")),
        ai_chat_max_retries=int(_env("AI_CHAT_MAX_RETRIES", "2")),
        ai_allow_no_api_key=_bool_env("AI_CHAT_ALLOW_NO_KEY", "true"),
        ai_fallback_to_fake=_bool_env("AI_CHAT_FALLBACK_FAKE", "false"),
        subscribe_task_updated=_bool_env(
            "INTELLIGENCE_SUBSCRIBE_TASK_UPDATED", "true"
        ),
        use_fake_ai=_bool_env("INTELLIGENCE_USE_FAKE_AI", "false"),
    )


def clear_config_cache() -> None:
    """Clear cached config (for tests that mutate environment)."""
    get_config.cache_clear()
