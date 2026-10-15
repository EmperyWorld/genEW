"""SQLAlchemy ORM models for analytics_service persistence."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON, Uuid


class Base(DeclarativeBase):
    """Declarative base for analytics service tables."""


class EventRow(Base):
    """Persisted analytics event."""

    __tablename__ = "analytics_events"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    event_type: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
    )
    source: Mapped[str | None] = mapped_column(String(128), nullable=True)
    user_id: Mapped[object | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
    )
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
