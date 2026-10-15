"""create catalog_apps table

Revision ID: 20260724_0001
Revises:
Create Date: 2026-07-24 22:00:00.000000
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
        "catalog_apps",
        sa.Column("app_id", sa.String(length=128), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("app_component", sa.String(length=128), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False, server_default="apps"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("icon", sa.String(length=512), nullable=True),
    )
    op.create_index(
        "ix_catalog_apps_app_component",
        "catalog_apps",
        ["app_component"],
    )


def downgrade() -> None:
    op.drop_index("ix_catalog_apps_app_component", table_name="catalog_apps")
    op.drop_table("catalog_apps")
