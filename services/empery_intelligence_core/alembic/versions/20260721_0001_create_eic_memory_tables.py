"""create eic_atoms and eic_doc_proposals tables

Revision ID: 20260721_0001
Revises:
Create Date: 2026-07-21 04:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260721_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "eic_atoms",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("tags_json", sa.JSON(), nullable=False),
        sa.Column("provenance_json", sa.JSON(), nullable=False),
        sa.Column("service_name", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("embedding", sa.LargeBinary(), nullable=True),
        sa.Column("embedding_dims", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "kind",
            "service_name",
            "content_hash",
            name="uq_eic_atoms_kind_service_hash",
        ),
    )
    op.create_index("ix_eic_atoms_kind", "eic_atoms", ["kind"])
    op.create_index("ix_eic_atoms_service_name", "eic_atoms", ["service_name"])
    op.create_index("ix_eic_atoms_created_at", "eic_atoms", ["created_at"])

    op.create_table(
        "eic_doc_proposals",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("target_relative_path", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("content_mode", sa.String(length=32), nullable=False),
        sa.Column("proposed_content", sa.Text(), nullable=False),
        sa.Column("base_sha256", sa.String(length=64), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("proposal_file_path", sa.Text(), nullable=False),
        sa.Column("atom_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_by", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("eic_doc_proposals")
    op.drop_index("ix_eic_atoms_created_at", table_name="eic_atoms")
    op.drop_index("ix_eic_atoms_service_name", table_name="eic_atoms")
    op.drop_index("ix_eic_atoms_kind", table_name="eic_atoms")
    op.drop_table("eic_atoms")
