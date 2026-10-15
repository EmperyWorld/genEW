"""Identity verification adapter — HTTP introspect only (no identity_service imports)."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import httpx

from core.container import ServiceContainer
from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.identity_verifier import (
    IdentityPrincipal,
    IdentityVerifyResponse,
)
from core.logging import log_event


def strip_bearer_token(authorization: str | None) -> str:
    """Extract raw token from ``Authorization: Bearer <token>``."""
    if authorization is None or not authorization.strip():
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="DEDMOROZ_UNAUTHORIZED",
                message="Missing Authorization bearer token",
            ),
            http_status=401,
        )
    value = authorization.strip()
    prefix = "Bearer "
    if not value.startswith(prefix):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="DEDMOROZ_UNAUTHORIZED",
                message="Malformed Authorization header; expected Bearer token",
            ),
            http_status=401,
        )
    token = value[len(prefix) :].strip()
    if not token:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="DEDMOROZ_UNAUTHORIZED",
                message="Empty bearer token",
            ),
            http_status=401,
        )
    return token


def _unauthorized(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="DEDMOROZ_UNAUTHORIZED",
            message="Identity verification failed",
            details={"reason": reason},
        ),
        http_status=401,
    )


def _identity_unavailable(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="IDENTITY_UNAVAILABLE",
            message="Identity verifier is not available",
            details={"reason": reason},
        ),
        http_status=503,
    )


class IdentityVerifierAdapter:
    """HTTP introspect adapter implementing IdentityVerifier protocol."""

    def __init__(
        self,
        *,
        mode: str,
        container: ServiceContainer,
        base_url: str,
        logger: logging.Logger,
        timeout_seconds: float = 5.0,
    ) -> None:
        self._mode = mode
        self._container = container
        self._base_url = base_url.rstrip("/")
        self._logger = logger
        self._timeout_seconds = timeout_seconds

    def verify_bearer_token(self, authorization: str | None) -> IdentityPrincipal:
        token = strip_bearer_token(authorization)
        return self.verify_token(token)

    def verify_token(self, token: str) -> IdentityPrincipal:
        raw = token.strip()
        if raw.startswith("Bearer "):
            raw = strip_bearer_token(raw)
        if not raw:
            raise _unauthorized("empty token")
        if self._mode == "http":
            return self._verify_http(raw)
        try:
            verifier = self._container.resolve("identity_verifier")
        except KeyError as exc:
            raise _identity_unavailable(
                "identity_verifier peer not registered"
            ) from exc
        if verifier is self:
            raise _identity_unavailable(
                "identity_verifier peer not registered; provide Fake or identity_service"
            )
        try:
            return verifier.verify_token(raw)
        except ServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            log_event(
                self._logger,
                event="dedmoroz.identity.rejected",
                message="Identity verifier rejected token",
                level=logging.WARNING,
                reason=str(exc),
            )
            raise _unauthorized(str(exc)) from exc

    def introspect(self, token: str) -> IdentityVerifyResponse:
        try:
            principal = self.verify_token(token)
            return IdentityVerifyResponse(active=True, principal=principal)
        except ServiceError as exc:
            if exc.response.error_code == "DEDMOROZ_UNAUTHORIZED":
                return IdentityVerifyResponse(
                    active=False,
                    error=exc.response.message,
                )
            raise

    def _verify_http(self, token: str) -> IdentityPrincipal:
        url = f"{self._base_url}/api/v1/auth/introspect"
        try:
            with httpx.Client(timeout=self._timeout_seconds) as client:
                response = client.post(
                    url,
                    json={"token": token},
                    headers={"Authorization": f"Bearer {token}"},
                )
        except httpx.HTTPError as exc:
            raise _identity_unavailable(f"identity HTTP error: {exc}") from exc

        if response.status_code in {401, 403}:
            raise _unauthorized(f"identity returned {response.status_code}")
        if response.status_code >= 500:
            raise _identity_unavailable(
                f"identity returned {response.status_code}"
            )
        if response.status_code != 200:
            raise _unauthorized(f"identity returned {response.status_code}")

        try:
            payload: dict[str, Any] = response.json()
        except ValueError as exc:
            raise _identity_unavailable("invalid identity JSON response") from exc

        if not payload.get("active", False):
            raise _unauthorized(payload.get("error") or "token inactive")

        principal_data = payload.get("principal") or payload
        user_id = (
            principal_data.get("user_id")
            or principal_data.get("sub")
            or payload.get("user_id")
            or payload.get("sub")
        )
        email = principal_data.get("email") or payload.get("email") or ""
        if user_id is None:
            raise _unauthorized("identity response missing user_id")
        try:
            return IdentityPrincipal(
                user_id=UUID(str(user_id)),
                email=str(email),
                roles=list(principal_data.get("roles") or []),
                permissions=list(principal_data.get("permissions") or []),
            )
        except (TypeError, ValueError) as exc:
            raise _unauthorized("invalid identity principal") from exc
