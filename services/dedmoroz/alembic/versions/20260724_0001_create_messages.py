"""create dedmoroz_messages table

Revision ID: 20260724_0001
Revises:
Create Date: 2026-07-24 17:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260724_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dedmoroz_messages",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_dedmoroz_messages_created_at", "dedmoroz_messages", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_dedmoroz_messages_created_at", table_name="dedmoroz_messages")
    op.drop_table("dedmoroz_messages")
