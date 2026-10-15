"""SQLAlchemy ORM models for intelligence_service persistence."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON, Uuid


class Base(DeclarativeBase):
    """Declarative base for intelligence service tables."""


class TaskInsightRow(Base):
    """Persisted AI insight for a task (one current row per task_id)."""

    __tablename__ = "task_insights"
    __table_args__ = (
        UniqueConstraint("task_id", name="uq_task_insights_task_id"),
    )

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    task_id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        # UniqueConstraint above already indexes task_id — avoid duplicate ix_ name.
        index=False,
    )
    suggested_priority: Mapped[str] = mapped_column(String(32), nullable=False)
    suggested_deadline: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    raw_ai_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
