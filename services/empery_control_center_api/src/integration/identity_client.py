"""HTTP adapter for identity_service — no identity_service package imports."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import httpx

from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.identity_verifier import IdentityPrincipal
from core.logging import log_event


def strip_bearer_token(authorization: str | None) -> str:
    """Extract raw token from ``Authorization: Bearer <token>``."""
    if authorization is None or not authorization.strip():
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_UNAUTHORIZED",
                message="Missing Authorization bearer token",
            ),
            http_status=401,
        )
    value = authorization.strip()
    prefix = "Bearer "
    if not value.startswith(prefix):
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_UNAUTHORIZED",
                message="Malformed Authorization header; expected Bearer token",
            ),
            http_status=401,
        )
    token = value[len(prefix) :].strip()
    if not token:
        raise ServiceError(
            StandardizedErrorResponse(
                error_code="ECC_UNAUTHORIZED",
                message="Empty bearer token",
            ),
            http_status=401,
        )
    return token


def _identity_unavailable(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="IDENTITY_UNAVAILABLE",
            message="Identity service is not available",
            details={"reason": reason},
        ),
        http_status=503,
    )


def _unauthorized(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="ECC_UNAUTHORIZED",
            message="Identity verification failed",
            details={"reason": reason},
        ),
        http_status=401,
    )


class IdentityClient:
    """Proxies login/me/introspect to identity_service over HTTP."""

    def __init__(
        self,
        *,
        base_url: str,
        logger: logging.Logger,
        timeout_seconds: float = 5.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._logger = logger
        self._timeout_seconds = timeout_seconds

    async def login(self, email: str, password: str) -> dict[str, Any]:
        url = f"{self._base_url}/api/v1/auth/login"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.post(
                    url,
                    json={"email": email, "password": password},
                )
        except httpx.HTTPError as exc:
            raise _identity_unavailable(f"identity HTTP error: {exc}") from exc

        if response.status_code == 401:
            body = _parse_json(response)
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=body.get("error_code", "IDENTITY_INVALID_CREDENTIALS"),
                    message=body.get("message", "Invalid email or password"),
                    details=_details(body.get("details")),
                ),
                http_status=401,
            )
        if response.status_code >= 500:
            raise _identity_unavailable(
                f"identity returned {response.status_code}"
            )
        if response.status_code != 200:
            body = _parse_json(response)
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=body.get("error_code", "ECC_AUTH_LOGIN_FAILED"),
                    message=body.get("message", "Login failed"),
                    details=_details(body.get("details")),
                ),
                http_status=response.status_code,
            )
        return response.json()

    async def register(
        self,
        email: str,
        password: str,
        display_name: str | None = None,
    ) -> dict[str, Any]:
        url = f"{self._base_url}/api/v1/auth/register"
        payload: dict[str, str] = {
            "email": email,
            "password": password,
            "display_name": display_name or email.split("@", 1)[0] or email,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.post(url, json=payload)
        except httpx.HTTPError as exc:
            raise _identity_unavailable(f"identity HTTP error: {exc}") from exc

        if response.status_code == 409:
            body = _parse_json(response)
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=body.get("error_code", "IDENTITY_EMAIL_TAKEN"),
                    message=body.get("message", "Email already registered"),
                    details=_details(body.get("details")),
                ),
                http_status=409,
            )
        if response.status_code >= 500:
            raise _identity_unavailable(
                f"identity returned {response.status_code}"
            )
        if response.status_code != 201:
            body = _parse_json(response)
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=body.get("error_code", "ECC_AUTH_REGISTER_FAILED"),
                    message=body.get("message", "Registration failed"),
                    details=_details(body.get("details")),
                ),
                http_status=response.status_code,
            )
        return response.json()

    async def me(self, authorization: str | None) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{self._base_url}/api/v1/auth/me"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.get(
                    url,
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
        return response.json()

    async def introspect_token(self, token: str) -> IdentityPrincipal:
        """Verify token via identity introspect endpoint."""
        url = f"{self._base_url}/api/v1/auth/introspect"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.post(
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

        user_id = payload.get("sub") or payload.get("user_id")
        email = payload.get("email") or ""
        if user_id is None:
            raise _unauthorized("identity response missing user_id")
        try:
            return IdentityPrincipal(
                user_id=UUID(str(user_id)),
                email=str(email),
                roles=list(payload.get("roles") or []),
                permissions=list(payload.get("permissions") or []),
            )
        except (TypeError, ValueError) as exc:
            raise _unauthorized("invalid identity principal") from exc

    async def request_password_reset(self, email: str) -> dict[str, Any]:
        """Request admin-mediated password reset token (proxied to identity_service)."""
        url = f"{self._base_url}/api/v1/auth/password-reset/request"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.post(url, json={"email": email})
        except httpx.HTTPError as exc:
            raise _identity_unavailable(f"identity HTTP error: {exc}") from exc

        if response.status_code >= 500:
            raise _identity_unavailable(
                f"identity returned {response.status_code}"
            )
        if response.status_code not in {200, 202}:
            body = _parse_json(response)
            details = body.get("details")
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=body.get(
                        "error_code", "ECC_PASSWORD_RESET_REQUEST_FAILED"
                    ),
                    message=body.get("message", "Password reset request failed"),
                    details=details if isinstance(details, dict) else {},
                ),
                http_status=response.status_code,
            )
        return response.json()

    async def confirm_password_reset(
        self, token: str, new_password: str
    ) -> dict[str, Any]:
        """Confirm password reset with token (proxied to identity_service)."""
        url = f"{self._base_url}/api/v1/auth/password-reset/confirm"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.post(
                    url,
                    json={"token": token, "new_password": new_password},
                )
        except httpx.HTTPError as exc:
            raise _identity_unavailable(f"identity HTTP error: {exc}") from exc

        if response.status_code >= 500:
            raise _identity_unavailable(
                f"identity returned {response.status_code}"
            )
        if response.status_code != 200:
            body = _parse_json(response)
            details = body.get("details")
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=body.get(
                        "error_code", "ECC_PASSWORD_RESET_CONFIRM_FAILED"
                    ),
                    message=body.get("message", "Password reset confirmation failed"),
                    details=details if isinstance(details, dict) else {},
                ),
                http_status=response.status_code,
            )
        return response.json()

    async def list_roles(self, authorization: str | None) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{self._base_url}/api/v1/roles"
        return await self._authorized_json("GET", url, token)

    async def get_user(
        self, user_id: UUID, authorization: str | None
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{self._base_url}/api/v1/users/{user_id}"
        return await self._authorized_json("GET", url, token)

    async def lookup_user_by_email(
        self, email: str, authorization: str | None
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        from urllib.parse import quote

        q = quote(email.strip(), safe="@.")
        url = f"{self._base_url}/api/v1/users/lookup?email={q}"
        return await self._authorized_json("GET", url, token)

    async def assign_role(
        self, user_id: UUID, role: str, authorization: str | None
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{self._base_url}/api/v1/users/{user_id}/roles"
        return await self._authorized_json(
            "POST", url, token, json_body={"role": role}
        )

    async def _authorized_json(
        self,
        method: str,
        url: str,
        token: str,
        *,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {token}"}
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                if method == "GET":
                    response = await client.get(url, headers=headers)
                else:
                    response = await client.post(
                        url, headers=headers, json=json_body or {}
                    )
        except httpx.HTTPError as exc:
            raise _identity_unavailable(f"identity HTTP error: {exc}") from exc

        if response.status_code in {401, 403}:
            raise _unauthorized(f"identity returned {response.status_code}")
        if response.status_code >= 500:
            raise _identity_unavailable(
                f"identity returned {response.status_code}"
            )
        if response.status_code not in {200, 201}:
            body = _parse_json(response)
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code=body.get("error_code", "ECC_IDENTITY_PROXY_FAILED"),
                    message=body.get("message", "Identity request failed"),
                    details=_details(body.get("details")),
                ),
                http_status=response.status_code,
            )
        return response.json()


def _details(raw: Any) -> dict[str, Any]:
    return raw if isinstance(raw, dict) else {}


def _parse_json(response: httpx.Response) -> dict[str, Any]:
    try:
        data = response.json()
        return data if isinstance(data, dict) else {}
    except ValueError:
        return {}


def log_identity_rejection(logger: logging.Logger, reason: str) -> None:
    log_event(
        logger,
        event="ecc.auth.rejected",
        message="Bearer token rejected",
        level=logging.WARNING,
        reason=reason,
    )
