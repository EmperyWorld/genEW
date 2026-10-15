"""Bearer token extraction helpers for identity_service."""

from __future__ import annotations

from fastapi import Request

from core.errors import ServiceError, StandardizedErrorResponse
from core.integration.identity_verifier import IdentityPrincipal
from services.identity_service.src.core.use_cases import IdentityUseCases


def extract_bearer_token(request: Request, *, required: bool = True) -> str | None:
    """
    Extract Bearer token from Authorization header.

    When ``required`` is True, missing/malformed headers raise IDENTITY_UNAUTHORIZED.
    """
    header = request.headers.get("Authorization")
    if header is None or not header.strip():
        if required:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_UNAUTHORIZED",
                    message="Missing Authorization Bearer token",
                ),
                http_status=401,
            )
        return None

    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        if required:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_UNAUTHORIZED",
                    message="Malformed Authorization header; expected Bearer token",
                ),
                http_status=401,
            )
        return None
    return parts[1].strip()


def resolve_principal(request: Request) -> IdentityPrincipal:
    """Require Bearer token and return verified IdentityPrincipal."""
    token = extract_bearer_token(request, required=True)
    assert token is not None
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    return use_cases.principal_from_token(token)
