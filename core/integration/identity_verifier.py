"""IdentityVerifier interface contract and Pydantic I/O models."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class IdentityPrincipal(BaseModel):
    """Immutable authenticated principal derived from a verified JWT."""

    model_config = ConfigDict(frozen=True)

    user_id: UUID
    email: str
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)


class IdentityVerifyResponse(BaseModel):
    """Result of token introspection / verification."""

    model_config = ConfigDict(frozen=True)

    active: bool
    principal: IdentityPrincipal | None = None
    error: str | None = None


class IdentityVerifier(Protocol):
    """
    Interface contract for identity token verification.

    Concrete implementations live in ``identity_service`` and are registered
    under provider names ``identity_token_service`` and ``identity_verifier``
    (alias). Consumers resolve ``identity_verifier`` via ServiceContainer —
    never import service internals for business logic.
    """

    def verify_token(self, token: str) -> IdentityPrincipal: ...

    def introspect(self, token: str) -> IdentityVerifyResponse: ...
