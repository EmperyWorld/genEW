"""Interface contracts for the auth service provider pattern."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from services.core_auth_service.src.core.models import (
    AuthSession,
    AuthUser,
    UserProfile,
)


class AuthRepositoryPort(Protocol):
    """Data-access contract resolved via ServiceContainer."""

    async def create_user(
        self,
        *,
        email: str,
        password: str,
        display_name: str,
    ) -> AuthUser: ...

    async def get_user_by_email(self, email: str) -> AuthUser | None: ...

    async def get_user_by_id(self, user_id: UUID) -> AuthUser | None: ...

    async def verify_password(self, user_id: UUID, password: str) -> bool: ...

    async def save_session(self, session: AuthSession) -> AuthSession: ...

    async def save_profile(self, profile: UserProfile) -> UserProfile: ...

    async def get_profile(self, user_id: UUID) -> UserProfile | None: ...

    async def count_users(self) -> int: ...
