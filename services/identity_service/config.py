"""Environment-specific configuration for identity_service."""

from __future__ import annotations

import logging
import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field

# ≥32 UTF-8 bytes — silences PyJWT InsecureKeyLengthWarning in development.
_DEV_JWT_PLACEHOLDER = "change-me-identity-dev-secret-min-32b!"

_KNOWN_WEAK_SECRETS = frozenset(
    {
        "change-me-identity-dev-secret",
        "change-me-identity-set-strong-secret",
        _DEV_JWT_PLACEHOLDER,
    }
)

_PROD_ENVS = frozenset({"production", "prod", "staging"})

MIN_JWT_SECRET_BYTES = 32

_logger = logging.getLogger("identity_service.config")


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _csv_env(key: str, default: str) -> list[str]:
    raw = _env(key, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


def jwt_secret_byte_length(secret: str) -> int:
    """Return UTF-8 byte length of a JWT signing secret."""
    return len(secret.encode("utf-8"))


def is_production_profile(empery_env: str | None = None) -> bool:
    """True when EMPERY_ENV selects a production-like profile."""
    env = (empery_env if empery_env is not None else _env("EMPERY_ENV", "")).strip().lower()
    return env in _PROD_ENVS


def validate_jwt_secret(secret: str, *, empery_env: str | None = None) -> None:
    """
    Enforce JWT secret policy.

    Production/staging: refuse missing, known weak placeholders, or length < 32.
    Development: allow placeholders but require ≥32 bytes when set; emit warning
    for known weak/dev placeholders.
    """
    cleaned = (secret or "").strip()
    prod = is_production_profile(empery_env)

    if not cleaned:
        if prod:
            raise ValueError(
                "IDENTITY_JWT_SECRET is required in production/staging "
                "(generate with: openssl rand -hex 32)"
            )
        raise ValueError("IDENTITY_JWT_SECRET must not be empty")

    byte_len = jwt_secret_byte_length(cleaned)
    if byte_len < MIN_JWT_SECRET_BYTES:
        msg = (
            f"IDENTITY_JWT_SECRET must be at least {MIN_JWT_SECRET_BYTES} UTF-8 bytes "
            f"(got {byte_len}); generate with: openssl rand -hex 32"
        )
        if prod:
            raise ValueError(msg)
        raise ValueError(msg)

    if cleaned in _KNOWN_WEAK_SECRETS or cleaned.startswith("change-me-identity"):
        if prod:
            raise ValueError(
                "IDENTITY_JWT_SECRET must not use a known weak/dev placeholder in "
                "production/staging; generate with: openssl rand -hex 32"
            )
        _logger.warning(
            "Using a development JWT secret placeholder — set IDENTITY_JWT_SECRET "
            "to a strong ≥32-byte value before production "
            "(openssl rand -hex 32)",
            extra={
                "event": "identity.config.weak_jwt_secret",
                "extra_fields": {
                    "empery_env": (empery_env or _env("EMPERY_ENV", "") or "development"),
                    "secret_bytes": byte_len,
                },
            },
        )


class ServiceConfig(BaseModel):
    """Immutable runtime configuration loaded from the environment."""

    model_config = ConfigDict(frozen=True)

    service_name: str = "identity_service"
    host: str = "0.0.0.0"
    port: int = 8003
    log_level: str = "INFO"
    empery_env: str = Field(
        default="development",
        description="Deployment profile from EMPERY_ENV (production refuses weak JWT secrets)",
    )
    database_url: str = Field(
        default="postgresql+psycopg://eworld:eworld@localhost:5432/identity",
        description="SQLAlchemy/Alembic database URL",
    )
    jwt_secret: str = Field(
        default=_DEV_JWT_PLACEHOLDER,
        description="HS256 signing key for access tokens — set IDENTITY_JWT_SECRET in prod (≥32 bytes)",
    )
    jwt_algorithm: str = Field(default="HS256", description="JWT signing algorithm")
    jwt_expires_minutes: int = Field(
        default=60,
        description="Access token TTL in minutes",
    )
    jwt_issuer: str = Field(
        default="identity_service",
        description="JWT iss claim — fixed for Trinity v0.1",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        description="Allowed CORS origins (comma-separated IDENTITY_CORS_ORIGINS)",
    )
    rate_limit_per_minute: int = Field(
        default=120,
        description="Per-client request budget per rolling minute (0 disables)",
    )
    seed_demo_user: bool = Field(
        default=False,
        description=(
            "Legacy lab flag: seed admin when users table is empty. "
            "Prefer SEED_OPERATOR_PASSWORD (strong secret via env)."
        ),
    )
    seed_operator_email: str = Field(
        default="admin@eworld.local",
        description="Bootstrap operator email when seeding an empty identity DB",
    )
    seed_operator_password: str | None = Field(
        default=None,
        description=(
            "When set and users table is empty, seed an admin operator with this password "
            "(SEED_OPERATOR_PASSWORD). Never commit the value."
        ),
    )
    seed_operator_display_name: str = Field(
        default="Operator",
        description="Display name for SEED_OPERATOR_* bootstrap user",
    )
    auto_create_tables: bool = Field(
        default=False,
        description="Call metadata.create_all on startup (sqlite/tests; prefer Alembic for Postgres)",
    )
    password_reset_reveal: bool = Field(
        default=False,
        description=(
            "Include reset_token in password-reset request responses for admin mediation "
            "(IDENTITY_PASSWORD_RESET_REVEAL; also auto-enabled in development/test)"
        ),
    )


@lru_cache
def get_config() -> ServiceConfig:
    """Return cached service configuration from environment variables."""
    empery_env = _env("EMPERY_ENV", "development")
    jwt_secret = _env("IDENTITY_JWT_SECRET", _DEV_JWT_PLACEHOLDER)
    validate_jwt_secret(jwt_secret, empery_env=empery_env)
    return ServiceConfig(
        host=_env("IDENTITY_HOST", "0.0.0.0"),
        port=int(_env("IDENTITY_PORT", "8003")),
        log_level=_env("LOG_LEVEL", "INFO"),
        empery_env=empery_env,
        database_url=_env(
            "IDENTITY_DATABASE_URL",
            _env(
                "DATABASE_URL",
                "postgresql+psycopg://eworld:eworld@localhost:5432/identity",
            ),
        ),
        jwt_secret=jwt_secret,
        jwt_algorithm=_env("IDENTITY_JWT_ALGORITHM", "HS256"),
        jwt_expires_minutes=int(_env("IDENTITY_JWT_EXPIRES_MINUTES", "60")),
        cors_origins=_csv_env(
            "IDENTITY_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ),
        rate_limit_per_minute=int(_env("IDENTITY_RATE_LIMIT_PER_MINUTE", "120")),
        seed_demo_user=_env("SEED_DEMO_USER", "false").lower() in {"1", "true", "yes"},
        seed_operator_email=_env("SEED_OPERATOR_EMAIL", "admin@eworld.local").strip()
        or "admin@eworld.local",
        seed_operator_password=(
            raw_pw
            if (raw_pw := _env("SEED_OPERATOR_PASSWORD", "").strip())
            else None
        ),
        seed_operator_display_name=_env(
            "SEED_OPERATOR_DISPLAY_NAME", "Operator"
        ).strip()
        or "Operator",
        auto_create_tables=_env("AUTO_CREATE_TABLES", "false").lower()
        in {"1", "true", "yes"},
        password_reset_reveal=_env("IDENTITY_PASSWORD_RESET_REVEAL", "false").lower()
        in {"1", "true", "yes"},
    )


def clear_config_cache() -> None:
    """Clear cached config (for tests that mutate environment)."""
    get_config.cache_clear()
