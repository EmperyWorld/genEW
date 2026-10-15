"""SQLAlchemy ORM models for identity_service persistence."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid


class Base(DeclarativeBase):
    """Declarative base for identity service tables."""


class UserRow(Base):
    """Persisted identity user."""

    __tablename__ = "identity_users"

    id: Mapped[object] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user_roles: Mapped[list[UserRoleRow]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class RoleRow(Base):
    """Persisted role definition."""

    __tablename__ = "identity_roles"

    id: Mapped[object] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    role_permissions: Mapped[list[RolePermissionRow]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
    )
    user_roles: Mapped[list[UserRoleRow]] = relationship(back_populates="role")


class PermissionRow(Base):
    """Persisted permission string."""

    __tablename__ = "identity_permissions"

    id: Mapped[object] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    role_permissions: Mapped[list[RolePermissionRow]] = relationship(
        back_populates="permission",
        cascade="all, delete-orphan",
    )


class RolePermissionRow(Base):
    """Junction: role ↔ permission."""

    __tablename__ = "identity_role_permissions"

    role_id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("identity_roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("identity_permissions.id", ondelete="CASCADE"),
        primary_key=True,
    )

    role: Mapped[RoleRow] = relationship(back_populates="role_permissions")
    permission: Mapped[PermissionRow] = relationship(back_populates="role_permissions")


class PasswordResetTokenRow(Base):
    """Single-use password reset token (stored as hash)."""

    __tablename__ = "identity_password_reset_tokens"

    id: Mapped[object] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("identity_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class UserRoleRow(Base):
    """Junction: user ↔ role."""

    __tablename__ = "identity_user_roles"

    user_id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("identity_users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role_id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("identity_roles.id", ondelete="CASCADE"),
        primary_key=True,
    )

    user: Mapped[UserRow] = relationship(back_populates="user_roles")
    role: Mapped[RoleRow] = relationship(back_populates="user_roles")
