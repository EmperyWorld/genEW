"""JWT issue / verify / introspect service implementing IdentityVerifier."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from jwt.exceptions import InvalidTokenError

from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.identity_verifier import (
    IdentityPrincipal,
    IdentityVerifyResponse,
)
from core.logging import log_event
from services.identity_service.config import (
    MIN_JWT_SECRET_BYTES,
    ServiceConfig,
    jwt_secret_byte_length,
)
from services.identity_service.src.core.models import TokenClaims


class IdentityTokenService:
    """
    HS256 JWT issuer and verifier.

    Implements IdentityTokenServicePort and the core IdentityVerifier Protocol.
    Registered as ``identity_token_service`` and aliased as ``identity_verifier``.
    """

    def __init__(self, config: ServiceConfig, logger: logging.Logger) -> None:
        self._config = config
        self._logger = logger

    def _assert_secret_strength(self) -> None:
        """Defense in depth — refuse to sign with a sub-32-byte secret."""
        secret = self._config.jwt_secret or ""
        if jwt_secret_byte_length(secret) < MIN_JWT_SECRET_BYTES:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_CONFIG_ERROR",
                    message=(
                        f"IDENTITY_JWT_SECRET must be at least "
                        f"{MIN_JWT_SECRET_BYTES} UTF-8 bytes"
                    ),
                    details={"secret_bytes": jwt_secret_byte_length(secret)},
                ),
                http_status=500,
            )

    def issue_token(
        self,
        *,
        user_id: UUID,
        email: str,
        roles: list[str],
        permissions: list[str],
    ) -> tuple[str, int]:
        self._assert_secret_strength()
        now = datetime.now(timezone.utc)
        expires_delta = timedelta(minutes=self._config.jwt_expires_minutes)
        expires_at = now + expires_delta
        expires_in = int(expires_delta.total_seconds())
        payload = {
            "sub": str(user_id),
            "email": email,
            "roles": list(roles),
            "permissions": list(permissions),
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
            "iss": self._config.jwt_issuer,
        }
        token = jwt.encode(
            payload,
            self._config.jwt_secret,
            algorithm=self._config.jwt_algorithm,
        )
        return token, expires_in

    def decode_token(self, token: str) -> TokenClaims:
        try:
            payload = jwt.decode(
                token,
                self._config.jwt_secret,
                algorithms=[self._config.jwt_algorithm],
                issuer=self._config.jwt_issuer,
                options={"require": ["sub", "email", "exp", "iat", "iss"]},
            )
        except InvalidTokenError as exc:
            log_event(
                self._logger,
                event="identity.token.invalid",
                message="JWT decode failed",
                level=logging.WARNING,
                reason=str(exc),
            )
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_INVALID_TOKEN",
                    message="Invalid or expired access token",
                    details={"reason": str(exc)},
                ),
                http_status=401,
            ) from exc

        return TokenClaims(
            sub=UUID(str(payload["sub"])),
            email=str(payload["email"]),
            roles=list(payload.get("roles") or []),
            permissions=list(payload.get("permissions") or []),
            exp=datetime.fromtimestamp(int(payload["exp"]), tz=timezone.utc),
            iat=datetime.fromtimestamp(int(payload["iat"]), tz=timezone.utc),
            iss=str(payload["iss"]),
        )

    def verify_token(self, token: str) -> IdentityPrincipal:
        claims = self.decode_token(token)
        return IdentityPrincipal(
            user_id=claims.sub,
            email=claims.email,
            roles=list(claims.roles),
            permissions=list(claims.permissions),
        )

    def introspect(self, token: str) -> IdentityVerifyResponse:
        try:
            principal = self.verify_token(token)
        except ServiceError as exc:
            return IdentityVerifyResponse(
                active=False,
                principal=None,
                error=exc.response.error_code,
            )
        except Exception as exc:  # noqa: BLE001 — introspect never raises
            return IdentityVerifyResponse(
                active=False,
                principal=None,
                error=str(exc),
            )
        return IdentityVerifyResponse(active=True, principal=principal, error=None)
