"""Interface contracts for the identity service provider pattern."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from core.integration.identity_verifier import (
    IdentityPrincipal,
    IdentityVerifier,
    IdentityVerifyResponse,
)
from services.identity_service.src.core.models import IdentityUser, Role, TokenClaims

__all__ = [
    "IdentityPrincipal",
    "IdentityRepositoryPort",
    "IdentityTokenServicePort",
    "IdentityVerifier",
    "IdentityVerifyResponse",
]


class IdentityRepositoryPort(Protocol):
    """Data-access contract resolved via ServiceContainer."""

    async def create_user(
        self,
        *,
        email: str,
        password: str,
        display_name: str,
        role_name: str = "member",
    ) -> IdentityUser: ...

    async def get_user_by_email(self, email: str) -> IdentityUser | None: ...

    async def get_user_by_id(self, user_id: UUID) -> IdentityUser | None: ...

    async def verify_password(self, user_id: UUID, password: str) -> bool: ...

    async def set_user_roles(
        self,
        user_id: UUID,
        role_names: list[str],
    ) -> IdentityUser: ...

    async def list_roles(self) -> list[Role]: ...

    async def ensure_default_roles(self) -> None: ...

    async def count_users(self) -> int: ...

    async def create_password_reset_token(
        self,
        user_id: UUID,
        *,
        ttl_hours: float = 1.0,
    ) -> str: ...

    async def confirm_password_reset(self, token: str, new_password: str) -> None: ...


class IdentityTokenServicePort(Protocol):
    """JWT issue/decode contract resolved via ServiceContainer."""

    def issue_token(
        self,
        *,
        user_id: UUID,
        email: str,
        roles: list[str],
        permissions: list[str],
    ) -> tuple[str, int]: ...

    def decode_token(self, token: str) -> TokenClaims: ...

    def verify_token(self, token: str) -> IdentityPrincipal: ...

    def introspect(self, token: str) -> IdentityVerifyResponse: ...
