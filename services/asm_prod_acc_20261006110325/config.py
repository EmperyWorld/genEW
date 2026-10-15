"""Environment-specific configuration for asm_prod_acc_20261006110325."""

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
        "ASM_PROD_ACC_20261006110325_DATABASE_URL",
        os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://eworld:eworld@localhost:5432/asm_prod_acc_20261006110325",
        ),
    )


class ServiceConfig(BaseModel):
    """Immutable runtime configuration."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "asm_prod_acc_20261006110325"
    host: str = "0.0.0.0"
    port: int = 8060
    log_level: str = "INFO"
    database_url: str = Field(
        default="postgresql+psycopg://eworld:eworld@localhost:5432/asm_prod_acc_20261006110325",
    )
    auto_create_tables: bool = False
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
    )


@lru_cache
def get_config() -> ServiceConfig:
    return ServiceConfig(
        host=_env("ASM_PROD_ACC_20261006110325_HOST", "0.0.0.0"),
        port=int(_env("ASM_PROD_ACC_20261006110325_PORT", _env("PORT", "8060"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        database_url=_database_url(),
        auto_create_tables=_env("AUTO_CREATE_TABLES", "false").lower()
        in {"1", "true", "yes"},
        cors_origins=_csv_env(
            "ASM_PROD_ACC_20261006110325_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174,"
            "http://127.0.0.1:5173,http://localhost:5173",
        ),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
