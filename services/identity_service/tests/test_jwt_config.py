"""JWT secret hardening (Wave 2)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from services.identity_service.config import (
    MIN_JWT_SECRET_BYTES,
    clear_config_cache,
    get_config,
    jwt_secret_byte_length,
    validate_jwt_secret,
)


@pytest.fixture(autouse=True)
def _clear_cache() -> Iterator[None]:
    clear_config_cache()
    yield
    clear_config_cache()


def test_validate_rejects_short_secret_in_prod() -> None:
    with pytest.raises(ValueError, match="at least 32"):
        validate_jwt_secret("too-short-secret", empery_env="production")


def test_validate_rejects_known_weak_placeholder_in_prod() -> None:
    with pytest.raises(ValueError, match="weak"):
        validate_jwt_secret(
            "change-me-identity-dev-secret-min-32b!",
            empery_env="staging",
        )


def test_validate_rejects_empty_in_prod() -> None:
    with pytest.raises(ValueError, match="required"):
        validate_jwt_secret("   ", empery_env="prod")


def test_validate_accepts_strong_secret_in_prod() -> None:
    secret = "a" * MIN_JWT_SECRET_BYTES
    assert jwt_secret_byte_length(secret) >= MIN_JWT_SECRET_BYTES
    validate_jwt_secret(secret, empery_env="production")


def test_get_config_dev_accepts_placeholder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EMPERY_ENV", "development")
    monkeypatch.setenv(
        "IDENTITY_JWT_SECRET",
        "change-me-identity-dev-secret-min-32b!",
    )
    clear_config_cache()
    cfg = get_config()
    assert jwt_secret_byte_length(cfg.jwt_secret) >= MIN_JWT_SECRET_BYTES


def test_get_config_prod_refuses_weak(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EMPERY_ENV", "production")
    monkeypatch.setenv(
        "IDENTITY_JWT_SECRET",
        "change-me-identity-set-strong-secret",
    )
    clear_config_cache()
    with pytest.raises(ValueError):
        get_config()
