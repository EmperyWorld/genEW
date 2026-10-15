"""SQLAlchemy ORM for desktop_shell catalog persistence."""

from __future__ import annotations

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for desktop_shell tables."""


class CatalogAppRow(Base):
    __tablename__ = "catalog_apps"

    app_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    app_component: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="apps")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    icon: Mapped[str | None] = mapped_column(String(512), nullable=True)
