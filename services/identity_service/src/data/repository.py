"""Identity data repository backed by DatabaseManager / SQLAlchemy."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from datetime import timedelta
from uuid import UUID, uuid4

import secrets

from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from core.data.database import DatabaseManager
from core.errors import ServiceError, StandardizedErrorResponse
from core.logging import log_event
from services.identity_service.src.core.models import IdentityUser, Role
from services.identity_service.src.core.roles import DEFAULT_ROLE_PERMISSIONS, KNOWN_ROLES
from services.identity_service.src.data.orm import (
    PasswordResetTokenRow,
    PermissionRow,
    RolePermissionRow,
    RoleRow,
    UserRoleRow,
    UserRow,
)
from services.identity_service.src.data.security import (
    hash_password,
    hash_reset_token,
    verify_password,
)


class IdentityRepository:
    """Postgres/SQLite-backed data-access boundary for identity entities."""

    def __init__(self, database: DatabaseManager, logger: logging.Logger) -> None:
        self._db = database
        self._logger = logger

    @staticmethod
    def _aware(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt

    def _effective_permissions(self, role_names: list[str]) -> list[str]:
        perms: set[str] = set()
        for name in role_names:
            perms.update(DEFAULT_ROLE_PERMISSIONS.get(name, []))
        return sorted(perms)

    def _to_user(self, row: UserRow) -> IdentityUser:
        role_names = sorted(
            {
                ur.role.name
                for ur in (row.user_roles or [])
                if ur.role is not None
            }
        )
        return IdentityUser(
            id=row.id,  # type: ignore[arg-type]
            email=row.email,
            display_name=row.display_name,
            is_active=row.is_active,
            roles=role_names,
            permissions=self._effective_permissions(role_names),
            created_at=self._aware(row.created_at),
        )

    def _to_role(self, row: RoleRow) -> Role:
        permission_names = sorted(
            {
                rp.permission.name
                for rp in (row.role_permissions or [])
                if rp.permission is not None
            }
        )
        # Prefer seeded constants if junction empty (defensive for partial seed).
        if not permission_names and row.name in DEFAULT_ROLE_PERMISSIONS:
            permission_names = list(DEFAULT_ROLE_PERMISSIONS[row.name])
        return Role(
            id=row.id,  # type: ignore[arg-type]
            name=row.name,
            permissions=permission_names,
            created_at=self._aware(row.created_at),
        )

    def _load_user_stmt(self):
        return select(UserRow).options(
            selectinload(UserRow.user_roles).selectinload(UserRoleRow.role)
        )

    async def ensure_default_roles(self) -> None:
        with self._db.session_scope() as session:
            for role_name, perm_names in DEFAULT_ROLE_PERMISSIONS.items():
                role = session.scalar(
                    select(RoleRow).where(RoleRow.name == role_name)
                )
                if role is None:
                    role = RoleRow(id=uuid4(), name=role_name, created_at=datetime.now(timezone.utc))
                    session.add(role)
                    session.flush()

                for perm_name in perm_names:
                    perm = session.scalar(
                        select(PermissionRow).where(PermissionRow.name == perm_name)
                    )
                    if perm is None:
                        perm = PermissionRow(
                            id=uuid4(),
                            name=perm_name,
                            created_at=datetime.now(timezone.utc),
                        )
                        session.add(perm)
                        session.flush()

                    link = session.get(RolePermissionRow, (role.id, perm.id))
                    if link is None:
                        session.add(
                            RolePermissionRow(role_id=role.id, permission_id=perm.id)
                        )
        log_event(
            self._logger,
            event="identity.repo.roles_seeded",
            message="Default roles and permissions ensured",
        )

    async def create_user(
        self,
        *,
        email: str,
        password: str,
        display_name: str,
        role_name: str = "member",
    ) -> IdentityUser:
        if role_name not in KNOWN_ROLES:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_ROLE_NOT_FOUND",
                    message="Unknown role name",
                    details={"role": role_name},
                ),
                http_status=404,
            )

        normalized = email.strip().lower()
        with self._db.session_scope() as session:
            existing = session.scalar(
                select(UserRow).where(UserRow.email == normalized)
            )
            if existing is not None:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="IDENTITY_EMAIL_TAKEN",
                        message="A user with this email already exists",
                        details={"email": normalized},
                    ),
                    http_status=409,
                )

            role = session.scalar(select(RoleRow).where(RoleRow.name == role_name))
            if role is None:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="IDENTITY_ROLE_NOT_FOUND",
                        message="Unknown role name",
                        details={"role": role_name},
                    ),
                    http_status=404,
                )

            now = datetime.now(timezone.utc)
            user_id = uuid4()
            row = UserRow(
                id=user_id,
                email=normalized,
                display_name=display_name.strip(),
                password_hash=hash_password(password),
                is_active=True,
                created_at=now,
            )
            session.add(row)
            session.flush()
            session.add(UserRoleRow(user_id=user_id, role_id=role.id))
            session.flush()

            loaded = session.scalar(
                self._load_user_stmt().where(UserRow.id == user_id)
            )
            assert loaded is not None
            user = self._to_user(loaded)

        log_event(
            self._logger,
            event="identity.repo.user_created",
            message="User created",
            user_id=str(user.id),
            email=user.email,
        )
        return user

    async def get_user_by_email(self, email: str) -> IdentityUser | None:
        normalized = email.strip().lower()
        with self._db.session_scope() as session:
            row = session.scalar(
                self._load_user_stmt().where(UserRow.email == normalized)
            )
            return self._to_user(row) if row else None

    async def get_user_by_id(self, user_id: UUID) -> IdentityUser | None:
        with self._db.session_scope() as session:
            row = session.scalar(self._load_user_stmt().where(UserRow.id == user_id))
            return self._to_user(row) if row else None

    async def verify_password(self, user_id: UUID, password: str) -> bool:
        with self._db.session_scope() as session:
            row = session.get(UserRow, user_id)
            if row is None:
                return False
            return verify_password(password, row.password_hash)

    async def set_user_roles(
        self,
        user_id: UUID,
        role_names: list[str],
    ) -> IdentityUser:
        unknown = [r for r in role_names if r not in KNOWN_ROLES]
        if unknown:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="IDENTITY_ROLE_NOT_FOUND",
                    message="Unknown role name",
                    details={"roles": unknown},
                ),
                http_status=404,
            )

        with self._db.session_scope() as session:
            user = session.get(UserRow, user_id)
            if user is None:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="IDENTITY_USER_NOT_FOUND",
                        message="User not found",
                        details={"user_id": str(user_id)},
                    ),
                    http_status=404,
                )

            roles = list(
                session.scalars(
                    select(RoleRow).where(RoleRow.name.in_(role_names))
                ).all()
            )
            if len(roles) != len(set(role_names)):
                found = {r.name for r in roles}
                missing = [r for r in role_names if r not in found]
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="IDENTITY_ROLE_NOT_FOUND",
                        message="Unknown role name",
                        details={"roles": missing},
                    ),
                    http_status=404,
                )

            session.execute(
                delete(UserRoleRow).where(UserRoleRow.user_id == user_id)
            )
            for role in roles:
                session.add(UserRoleRow(user_id=user_id, role_id=role.id))
            session.flush()

            loaded = session.scalar(
                self._load_user_stmt().where(UserRow.id == user_id)
            )
            assert loaded is not None
            result = self._to_user(loaded)

        log_event(
            self._logger,
            event="identity.repo.roles_set",
            message="User roles replaced",
            user_id=str(user_id),
            roles=list(role_names),
        )
        return result

    async def list_roles(self) -> list[Role]:
        with self._db.session_scope() as session:
            rows = list(
                session.scalars(
                    select(RoleRow)
                    .options(
                        selectinload(RoleRow.role_permissions).selectinload(
                            RolePermissionRow.permission
                        )
                    )
                    .order_by(RoleRow.name)
                ).all()
            )
            return [self._to_role(row) for row in rows]

    async def count_users(self) -> int:
        with self._db.session_scope() as session:
            return int(
                session.scalar(select(func.count()).select_from(UserRow)) or 0
            )

    async def create_password_reset_token(
        self,
        user_id: UUID,
        *,
        ttl_hours: float = 1.0,
    ) -> str:
        """Create a single-use reset token; invalidate prior unused tokens for the user."""
        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_reset_token(raw_token)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=ttl_hours)

        with self._db.session_scope() as session:
            user = session.get(UserRow, user_id)
            if user is None:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="IDENTITY_USER_NOT_FOUND",
                        message="User not found",
                        details={"user_id": str(user_id)},
                    ),
                    http_status=404,
                )

            unused = session.scalars(
                select(PasswordResetTokenRow).where(
                    PasswordResetTokenRow.user_id == user_id,
                    PasswordResetTokenRow.used_at.is_(None),
                )
            ).all()
            for row in unused:
                row.used_at = now

            session.add(
                PasswordResetTokenRow(
                    id=uuid4(),
                    user_id=user_id,
                    token_hash=token_hash,
                    expires_at=expires_at,
                    used_at=None,
                    created_at=now,
                )
            )

        log_event(
            self._logger,
            event="identity.repo.password_reset_token_created",
            message="Password reset token created",
            user_id=str(user_id),
        )
        return raw_token

    async def confirm_password_reset(self, token: str, new_password: str) -> None:
        """Validate reset token, set new password hash, and mark token used."""
        token_hash = hash_reset_token(token)
        now = datetime.now(timezone.utc)

        with self._db.session_scope() as session:
            row = session.scalar(
                select(PasswordResetTokenRow).where(
                    PasswordResetTokenRow.token_hash == token_hash
                )
            )
            if row is None:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="IDENTITY_RESET_TOKEN_INVALID",
                        message="Invalid or expired password reset token",
                    ),
                    http_status=400,
                )

            if row.used_at is not None:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="IDENTITY_RESET_TOKEN_USED",
                        message="Password reset token has already been used",
                    ),
                    http_status=400,
                )

            expires_at = self._aware(row.expires_at)
            if expires_at <= now:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="IDENTITY_RESET_TOKEN_EXPIRED",
                        message="Password reset token has expired",
                    ),
                    http_status=400,
                )

            user = session.get(UserRow, row.user_id)
            if user is None or not user.is_active:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="IDENTITY_RESET_TOKEN_INVALID",
                        message="Invalid or expired password reset token",
                    ),
                    http_status=400,
                )

            user.password_hash = hash_password(new_password)
            row.used_at = now
            confirmed_user_id = row.user_id

        log_event(
            self._logger,
            event="identity.repo.password_reset_confirmed",
            message="Password reset confirmed",
            user_id=str(confirmed_user_id),
        )
