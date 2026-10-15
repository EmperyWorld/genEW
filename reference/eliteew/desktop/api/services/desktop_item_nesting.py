# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Resolve and validate desktop item folder nesting (parent_item_id ↔ parent_id FK).
# Invariants:
# - System folders stay at desktop root; no folder cycles.
# Related:
# - api/routers/desktop.py
# ---

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.desktop import DesktopItem, ItemType

SYSTEM_FOLDER_ITEM_IDS: frozenset[str] = frozenset(
    {
        "documents",
        "images",
        "projects",
        "downloads",
        "content",
        "trash",
        "music",
        "ewa_file",
    }
)


def is_system_folder_item_id(item_id: str | None) -> bool:
    return bool(item_id) and item_id in SYSTEM_FOLDER_ITEM_IDS


def is_system_folder_row(item: DesktopItem) -> bool:
    return bool(getattr(item, "is_system", False)) and bool(item.item_type == ItemType.FOLDER)


async def _get_row_by_item_id(
    db: AsyncSession,
    config_id: UUID,
    item_id: str,
) -> DesktopItem | None:
    result = await db.execute(
        select(DesktopItem).where(
            DesktopItem.config_id == config_id,
            DesktopItem.item_id == item_id,
        )
    )
    return result.scalar_one_or_none()


async def _get_row_by_pk(
    db: AsyncSession,
    config_id: UUID,
    row_id: UUID,
) -> DesktopItem | None:
    result = await db.execute(
        select(DesktopItem).where(
            DesktopItem.config_id == config_id,
            DesktopItem.id == row_id,
        )
    )
    return result.scalar_one_or_none()


async def _assert_no_folder_cycle(
    db: AsyncSession,
    config_id: UUID,
    *,
    item_id: str,
    parent_row: DesktopItem,
) -> None:
    cursor: DesktopItem | None = parent_row
    visited = 0
    while cursor is not None and visited < 256:
        if cursor.item_id == item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Folder nesting would create a cycle",
            )
        if cursor.parent_id is None:
            return
        cursor = await _get_row_by_pk(db, config_id, cursor.parent_id)
        visited += 1


async def resolve_parent_row_id(
    db: AsyncSession,
    config_id: UUID,
    *,
    item_id: str,
    item_type: ItemType,
    parent_item_id: str | None,
    existing_row: DesktopItem | None = None,
) -> UUID | None:
    """Map wire parent_item_id to desktop_items.id FK with nesting guards."""
    if not parent_item_id or not str(parent_item_id).strip():
        if existing_row is not None and (
            is_system_folder_row(existing_row) or is_system_folder_item_id(existing_row.item_id)
        ):
            return None
        return None

    parent_key = str(parent_item_id).strip()
    if parent_key == item_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item cannot be nested inside itself",
        )

    if is_system_folder_item_id(item_id) or (
        existing_row is not None
        and (is_system_folder_row(existing_row) or is_system_folder_item_id(existing_row.item_id))
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System folders must stay on the desktop root",
        )

    parent_row = await _get_row_by_item_id(db, config_id, parent_key)
    if parent_row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Parent folder not found: {parent_key}",
        )
    if parent_row.item_type != ItemType.FOLDER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Parent must be a folder",
        )

    if item_type == ItemType.FOLDER:
        await _assert_no_folder_cycle(db, config_id, item_id=item_id, parent_row=parent_row)

    parent_id = parent_row.id
    return parent_id if isinstance(parent_id, UUID) else UUID(str(parent_id))


def build_parent_item_id_map(rows: list[DesktopItem]) -> dict[UUID, str]:
    by_pk = {row.id: row.item_id for row in rows}
    out: dict[UUID, str] = {}
    for row in rows:
        if row.parent_id is None:
            continue
        parent_item_id = by_pk.get(row.parent_id)
        if parent_item_id is not None:
            out[row.id] = parent_item_id
    return out


def parent_item_id_for_row(row: DesktopItem, parent_map: dict[UUID, str]) -> str | None:
    return parent_map.get(row.id)


def sort_items_for_bulk_insert(
    items: list[tuple[str, str | None]],
) -> list[tuple[str, str | None]]:
    """Topological order: parents before children (item_id, parent_item_id)."""
    by_id = {item_id: parent_id for item_id, parent_id in items}
    depth_cache: dict[str, int] = {}

    def depth(item_id: str, seen: set[str] | None = None) -> int:
        if item_id in depth_cache:
            return depth_cache[item_id]
        if seen is None:
            seen = set()
        if item_id in seen:
            depth_cache[item_id] = 0
            return 0
        seen.add(item_id)
        parent_id = by_id.get(item_id)
        if not parent_id or parent_id not in by_id:
            depth_cache[item_id] = 0
            return 0
        d = 1 + depth(parent_id, seen)
        depth_cache[item_id] = d
        return d

    return sorted(items, key=lambda pair: (depth(pair[0]), pair[0]))
