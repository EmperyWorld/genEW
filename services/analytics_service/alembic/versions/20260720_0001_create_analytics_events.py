"""create analytics_events table

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
        "analytics_events",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("source", sa.String(length=128), nullable=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_analytics_events_event_type",
        "analytics_events",
        ["event_type"],
    )
    op.create_index(
        "ix_analytics_events_user_id",
        "analytics_events",
        ["user_id"],
    )
    op.create_index(
        "ix_analytics_events_ingested_at",
        "analytics_events",
        ["ingested_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_analytics_events_ingested_at",
        table_name="analytics_events",
    )
    op.drop_index(
        "ix_analytics_events_user_id",
        table_name="analytics_events",
    )
    op.drop_index(
        "ix_analytics_events_event_type",
        table_name="analytics_events",
    )
    op.drop_table("analytics_events")
