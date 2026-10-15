"""Identity verification adapter — no identity_service package imports."""

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
                error_code="TASK_UNAUTHORIZED",
                message="Missing Authorization bearer token",
            ),
            http_status=401,
        )
    value = authorization.strip()
    prefix = "Bearer "
    if not value.startswith(prefix):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="TASK_UNAUTHORIZED",
                message="Malformed Authorization header; expected Bearer token",
            ),
            http_status=401,
        )
    token = value[len(prefix) :].strip()
    if not token:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="TASK_UNAUTHORIZED",
                message="Empty bearer token",
            ),
            http_status=401,
        )
    return token


def _unauthorized(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="TASK_UNAUTHORIZED",
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
    """
    Adapter implementing write-path identity verification.

    * **container mode:** resolve provider ``identity_verifier`` by name only,
      strip Bearer, call ``verify_token``. Never imports ``identity_service``.
    * **http mode:** ``POST {base_url}/api/v1/auth/introspect``.

    When this adapter is itself registered as ``identity_verifier`` (HTTP /
    fallback), ``verify_token`` performs HTTP or raises ``IDENTITY_UNAVAILABLE``
    in container mode without a peer implementation.
    """

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
        """Strip Bearer header, resolve ``identity_verifier``, call verify_token."""
        token = strip_bearer_token(authorization)
        return self._verify_resolved(token)

    def verify_token(self, token: str) -> IdentityPrincipal:
        """IdentityVerifier Protocol: accept raw or Bearer-prefixed token."""
        raw = token.strip()
        if raw.startswith("Bearer "):
            raw = strip_bearer_token(raw)
        if not raw:
            raise _unauthorized("empty token")
        if self._mode == "http":
            return self._verify_http(raw)
        # Container-mode instance registered as the sole identity_verifier:
        # no peer implementation is available.
        raise _identity_unavailable(
            "identity_verifier peer not registered; provide Fake or identity_service"
        )

    def introspect(self, token: str) -> IdentityVerifyResponse:
        """IdentityVerifier Protocol introspect."""
        try:
            principal = self.verify_token(token)
            return IdentityVerifyResponse(active=True, principal=principal)
        except ServiceError as exc:
            if exc.response.error_code == "TASK_UNAUTHORIZED":
                return IdentityVerifyResponse(
                    active=False,
                    error=exc.response.message,
                )
            raise

    def _verify_resolved(self, token: str) -> IdentityPrincipal:
        if self._mode == "http":
            return self._verify_http(token)
        try:
            verifier = self._container.resolve("identity_verifier")
        except KeyError as exc:
            raise _identity_unavailable(
                "identity_verifier is not registered in ServiceContainer"
            ) from exc
        if verifier is self:
            raise _identity_unavailable(
                "identity_verifier peer not registered; provide Fake or identity_service"
            )
        try:
            return verifier.verify_token(token)
        except ServiceError:
            raise
        except Exception as exc:  # noqa: BLE001 — map to unauthorized
            log_event(
                self._logger,
                event="task.identity.rejected",
                message="Identity verifier rejected token",
                level=logging.WARNING,
                reason=str(exc),
            )
            raise _unauthorized(str(exc)) from exc

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
        # Identity HTTP introspect uses JWT-style `sub`; container mode uses `user_id`.
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
