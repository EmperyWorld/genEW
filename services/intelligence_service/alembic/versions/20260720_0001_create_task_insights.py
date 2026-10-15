"""create task_insights table

Revision ID: 20260720_0001
Revises:
Create Date: 2026-07-20 19:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260720_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_insights",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("task_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("suggested_priority", sa.String(length=32), nullable=False),
        sa.Column("suggested_deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("raw_ai_json", sa.JSON(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("task_id", name="ix_task_insights_task_id"),
    )
    op.create_index(
        "ix_task_insights_task_id_idx",
        "task_insights",
        ["task_id"],
    )
    op.create_index(
        "ix_task_insights_generated_at",
        "task_insights",
        ["generated_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_task_insights_generated_at",
        table_name="task_insights",
    )
    op.drop_index(
        "ix_task_insights_task_id_idx",
        table_name="task_insights",
    )
    op.drop_constraint(
        "ix_task_insights_task_id",
        "task_insights",
        type_="unique",
    )
    op.drop_table("task_insights")
