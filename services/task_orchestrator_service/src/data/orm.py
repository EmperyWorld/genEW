"""SQLAlchemy ORM models for task_orchestrator_service persistence."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import Uuid


class Base(DeclarativeBase):
    """Declarative base for task orchestrator service tables."""


class TaskRow(Base):
    """Persisted Kanban task."""

    __tablename__ = "tasks"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    priority: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="medium",
    )
    assignee_id: Mapped[object | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
    )
    created_by: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
    )
    updated_by: Mapped[object | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
