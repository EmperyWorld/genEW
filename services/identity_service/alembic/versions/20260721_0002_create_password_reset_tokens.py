"""create identity password reset tokens table

Revision ID: 20260721_0002
Revises: 20260720_0001
Create Date: 2026-07-21 12:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260721_0002"
down_revision: Union[str, None] = "20260720_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "identity_password_reset_tokens",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["identity_users.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_identity_password_reset_tokens_user_id",
        "identity_password_reset_tokens",
        ["user_id"],
    )
    op.create_index(
        "ix_identity_password_reset_tokens_token_hash",
        "identity_password_reset_tokens",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_identity_password_reset_tokens_token_hash",
        table_name="identity_password_reset_tokens",
    )
    op.drop_index(
        "ix_identity_password_reset_tokens_user_id",
        table_name="identity_password_reset_tokens",
    )
    op.drop_table("identity_password_reset_tokens")
