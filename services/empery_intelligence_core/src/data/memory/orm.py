"""SQLAlchemy ORM models for EIC Atom store and doc proposals."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON, Uuid


class Base(DeclarativeBase):
    """Declarative base for EIC memory tables."""


class AtomRow(Base):
    __tablename__ = "eic_atoms"
    __table_args__ = (
        UniqueConstraint(
            "kind",
            "service_name",
            "content_hash",
            name="uq_eic_atoms_kind_service_hash",
        ),
    )

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    tags_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    provenance_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    service_name: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        default="",
        index=True,
    )
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    embedding_dims: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        server_default=func.now(),
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class DocProposalRow(Base):
    __tablename__ = "eic_doc_proposals"

    id: Mapped[object] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    target_relative_path: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    content_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    proposed_content: Mapped[str] = mapped_column(Text, nullable=False)
    base_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    proposal_file_path: Mapped[str] = mapped_column(Text, nullable=False)
    atom_id: Mapped[object | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    applied_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
