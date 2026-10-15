"""Immutable core domain entities."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AuthUser(BaseModel):
    """Immutable authenticated user entity."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    email: str
    display_name: str
    is_active: bool = True
    created_at: datetime


class AuthSession(BaseModel):
    """Immutable auth session entity."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    user_id: UUID
    token_hash: str
    expires_at: datetime
    created_at: datetime


class UserProfile(BaseModel):
    """Immutable AI-derived user profile entity."""

    model_config = ConfigDict(frozen=True)

    user_id: UUID
    summary: str
    traits: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    provider: str
    updated_at: datetime
    raw: dict[str, Any] = Field(default_factory=dict)


class ChatMessage(BaseModel):
    """Immutable AI chat message entity."""

    model_config = ConfigDict(frozen=True)

    role: str = Field(pattern="^(system|user|assistant)$")
    content: str
