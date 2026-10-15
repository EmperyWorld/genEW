"""Auth data repository backed by DatabaseManager / SQLAlchemy."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import func, select

from core.data.database import DatabaseManager
from core.errors import ServiceError, StandardizedErrorResponse
from core.logging import log_event
from services.core_auth_service.src.core.models import AuthSession, AuthUser, UserProfile
from services.core_auth_service.src.data.orm import SessionRow, UserProfileRow, UserRow
from services.core_auth_service.src.data.security import hash_password, verify_password


class AuthRepository:
    """Postgres/SQLite-backed data-access boundary for auth entities."""

    def __init__(self, database: DatabaseManager, logger: logging.Logger) -> None:
        self._db = database
        self._logger = logger

    def _to_user(self, row: UserRow) -> AuthUser:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return AuthUser(
            id=row.id,  # type: ignore[arg-type]
            email=row.email,
            display_name=row.display_name,
            is_active=row.is_active,
            created_at=created,
        )

    def _to_profile(self, row: UserProfileRow) -> UserProfile:
        updated = row.updated_at
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        return UserProfile(
            user_id=row.user_id,  # type: ignore[arg-type]
            summary=row.summary,
            traits=list(row.traits_json or []),
            interests=list(row.interests_json or []),
            confidence=float(row.confidence or 0.0),
            provider=row.provider,
            updated_at=updated,
            raw=dict(row.raw_json or {}),
        )

    async def create_user(
        self,
        *,
        email: str,
        password: str,
        display_name: str,
    ) -> AuthUser:
        normalized = email.strip().lower()
        with self._db.session_scope() as session:
            existing = session.scalar(
                select(UserRow).where(UserRow.email == normalized)
            )
            if existing is not None:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="AUTH_EMAIL_EXISTS",
                        message="A user with this email already exists",
                        details={"email": normalized},
                    ),
                    http_status=409,
                )
            now = datetime.now(timezone.utc)
            row = UserRow(
                id=uuid4(),
                email=normalized,
                display_name=display_name.strip(),
                password_hash=hash_password(password),
                is_active=True,
                created_at=now,
            )
            session.add(row)
            session.flush()
            user = self._to_user(row)
        log_event(
            self._logger,
            event="auth.repo.user_created",
            message="User created",
            user_id=str(user.id),
            email=user.email,
        )
        return user

    async def get_user_by_email(self, email: str) -> AuthUser | None:
        normalized = email.strip().lower()
        with self._db.session_scope() as session:
            row = session.scalar(select(UserRow).where(UserRow.email == normalized))
            return self._to_user(row) if row else None

    async def get_user_by_id(self, user_id: UUID) -> AuthUser | None:
        with self._db.session_scope() as session:
            row = session.get(UserRow, user_id)
            return self._to_user(row) if row else None

    async def verify_password(self, user_id: UUID, password: str) -> bool:
        with self._db.session_scope() as session:
            row = session.get(UserRow, user_id)
            if row is None:
                return False
            return verify_password(password, row.password_hash)

    async def save_session(self, session_entity: AuthSession) -> AuthSession:
        with self._db.session_scope() as session:
            row = SessionRow(
                id=session_entity.id,
                user_id=session_entity.user_id,
                token_hash=session_entity.token_hash,
                expires_at=session_entity.expires_at,
                created_at=session_entity.created_at,
            )
            session.add(row)
        log_event(
            self._logger,
            event="auth.repo.session_saved",
            message="Auth session persisted",
            session_id=str(session_entity.id),
            user_id=str(session_entity.user_id),
        )
        return session_entity

    async def save_profile(self, profile: UserProfile) -> UserProfile:
        with self._db.session_scope() as session:
            row = session.get(UserProfileRow, profile.user_id)
            if row is None:
                row = UserProfileRow(user_id=profile.user_id)
                session.add(row)
            row.summary = profile.summary
            row.traits_json = list(profile.traits)
            row.interests_json = list(profile.interests)
            row.confidence = float(profile.confidence)
            row.provider = profile.provider
            row.raw_json = dict(profile.raw)
            row.updated_at = profile.updated_at
            session.flush()
            saved = self._to_profile(row)
        log_event(
            self._logger,
            event="auth.repo.profile_saved",
            message="User profile persisted",
            user_id=str(profile.user_id),
            provider=profile.provider,
        )
        return saved

    async def get_profile(self, user_id: UUID) -> UserProfile | None:
        with self._db.session_scope() as session:
            row = session.get(UserProfileRow, user_id)
            return self._to_profile(row) if row else None

    async def count_users(self) -> int:
        with self._db.session_scope() as session:
            return int(session.scalar(select(func.count()).select_from(UserRow)) or 0)
