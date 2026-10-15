"""Immutable core domain entities for identity_service."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class IdentityUser(BaseModel):
    """Immutable identity user entity with effective roles/permissions."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    email: str
    display_name: str
    is_active: bool = True
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    created_at: datetime


class Role(BaseModel):
    """Immutable role entity with associated permission strings."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    permissions: list[str] = Field(default_factory=list)
    created_at: datetime


class TokenClaims(BaseModel):
    """Immutable decoded JWT claims for identity_service tokens."""

    model_config = ConfigDict(frozen=True)

    sub: UUID
    email: str
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    exp: datetime
    iat: datetime
    iss: str
