"""create chat_sessions + chat_messages (production companion schema)

Revision ID: 20260723_0002
Revises: 20260723_0001
Create Date: 2026-07-23 21:40:00.000000

Note: live DB may already have this schema from an earlier genesis; this
revision documents the production shape. Fresh installs from 0001 should
upgrade via this revision when applying from empty.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260723_0002"
down_revision: Union[str, None] = "20260723_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "chat_sessions" not in tables:
        op.create_table(
            "chat_sessions",
            sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("title", sa.String(length=256), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("owner_id", sa.Uuid(as_uuid=True), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.create_index("ix_chat_sessions_owner_id", "chat_sessions", ["owner_id"])
        op.create_index("ix_chat_sessions_status", "chat_sessions", ["status"])
        op.create_index("ix_chat_sessions_updated_at", "chat_sessions", ["updated_at"])

    if "chat_messages" in tables:
        # Existing production-shaped table — leave as-is.
        return

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column(
            "metadata_json",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["chat_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "session_id",
            "sequence",
            name="uq_chat_messages_session_seq",
        ),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])


def downgrade() -> None:
    pass
