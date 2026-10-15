"""Unit tests for IdentityTokenService / IdentityVerifier."""

from __future__ import annotations

import logging
from uuid import uuid4

import pytest

from core.container import ServiceContainer
from core.errors import ServiceError
from core.integration.identity_verifier import IdentityPrincipal, IdentityVerifyResponse
from services.identity_service.config import ServiceConfig
from services.identity_service.src.api.main import _wire_dependencies
from services.identity_service.src.data.jwt_service import IdentityTokenService


def _service() -> IdentityTokenService:
    return IdentityTokenService(
        ServiceConfig(
            database_url="sqlite+pysqlite:///:memory:",
            jwt_secret="test-secret-identity-32bytes-min!",
            jwt_expires_minutes=60,
            seed_demo_user=False,
            auto_create_tables=True,
        ),
        logging.getLogger("test_token_service"),
    )


def test_issue_verify_and_introspect() -> None:
    svc = _service()
    user_id = uuid4()
    token, expires_in = svc.issue_token(
        user_id=user_id,
        email="alice@example.com",
        roles=["member"],
        permissions=["identity:users:read", "identity:introspect"],
    )
    assert expires_in == 3600
    assert isinstance(token, str)

    principal = svc.verify_token(token)
    assert isinstance(principal, IdentityPrincipal)
    assert principal.user_id == user_id
    assert principal.email == "alice@example.com"
    assert principal.roles == ["member"]
    assert "identity:users:read" in principal.permissions

    claims = svc.decode_token(token)
    assert claims.iss == "identity_service"
    assert claims.sub == user_id
    assert claims.roles == ["member"]
    assert claims.permissions

    active = svc.introspect(token)
    assert isinstance(active, IdentityVerifyResponse)
    assert active.active is True
    assert active.principal is not None
    assert active.principal.user_id == user_id


def test_introspect_inactive_on_bad_token() -> None:
    svc = _service()
    result = svc.introspect("garbage.token.value")
    assert result.active is False
    assert result.principal is None
    assert result.error == "IDENTITY_INVALID_TOKEN"


def test_verify_token_raises_on_bad_token() -> None:
    svc = _service()
    with pytest.raises(ServiceError) as exc_info:
        svc.verify_token("garbage.token.value")
    assert exc_info.value.response.error_code == "IDENTITY_INVALID_TOKEN"
    assert exc_info.value.http_status == 401


def test_identity_verifier_alias_resolves_same_instance() -> None:
    container = ServiceContainer()
    config = ServiceConfig(
        database_url="sqlite+pysqlite:///:memory:",
        jwt_secret="test-secret-identity-32bytes-min!",
        seed_demo_user=False,
        auto_create_tables=True,
    )
    _wire_dependencies(container, config)
    token_svc = container.resolve("identity_token_service")
    verifier = container.resolve("identity_verifier")
    assert token_svc is verifier
    assert isinstance(token_svc, IdentityTokenService)
