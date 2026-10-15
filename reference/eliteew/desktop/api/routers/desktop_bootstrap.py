# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Desktop workspace bootstrap: system folder seeding, App Store icon normalization, legacy cleanup.
# Invariants:
# - No imports from ``desktop_workspace``; parent constants via lazy ``_desktop()`` from ``desktop``.
# - Re-exported through ``desktop_workspace`` → ``desktop`` for ``desktop_shell`` / ``desktop_store``.
# Related:
# - api/routers/desktop_workspace.py (items CRUD consumer)
# - api/routers/desktop_shell.py (``GET /config`` seeds folders/icons)
# - api/routers/desktop_store.py (legacy cleanup on store reads)
# ---
"""Desktop system initialization helpers — folders, App Store icon, legacy state cleanup."""

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.desktop import DesktopConfig, DesktopItem, ItemType, UserInstalledApp
from api.utils.datetime_helpers import utc_now_naive


def _desktop():
    from api.routers import desktop as d

    return d


DESKTOP_MIN_COORDINATE = 20
APP_STORE_POSITION_COLUMNS = (130, 240, 350, 460, 570, 680)
APP_STORE_POSITION_ROWS = (20, 130, 240, 350, 460, 570, 680)

# System folder keys: created automatically, cannot delete/rename
SYSTEM_FOLDER_KEYS = ("documents", "images", "projects", "downloads", "content", "trash", "music", "ewa_file")
SYSTEM_FOLDER_NAMES = {
    "documents": "Documents",
    "images": "Images",
    "projects": "Projects",
    "downloads": "Downloads",
    "content": "Content",
    "trash": "Trash",
    "music": "Музыка",
    "ewa_file": "EwaFile",
}

# Default positions for newly created system folders (so they don't all stack at 0,0)
SYSTEM_FOLDER_DEFAULT_POSITIONS: dict[str, dict[str, int]] = {
    "documents": {"x": 20, "y": 20},
    "images": {"x": 20, "y": 130},
    "projects": {"x": 20, "y": 240},
    "downloads": {"x": 20, "y": 350},
    "content": {"x": 20, "y": 460},
    "trash": {"x": 20, "y": 570},
    "music": {"x": 20, "y": 680},
    "ewa_file": {"x": 130, "y": 460},
}


def _normalize_item_position(position: object) -> dict[str, int] | None:
    if not isinstance(position, dict):
        return None
    x = position.get("x")
    y = position.get("y")
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        return None
    return {"x": int(x), "y": int(y)}


def _position_needs_normalization(position: object) -> bool:
    normalized = _normalize_item_position(position)
    return normalized is None or normalized["x"] < DESKTOP_MIN_COORDINATE or normalized["y"] < DESKTOP_MIN_COORDINATE


def _pick_app_store_position(items: list[DesktopItem]) -> dict[str, int]:
    occupied_positions: set[tuple[int, int]] = set()
    for item in items:
        normalized = _normalize_item_position(getattr(item, "position", None))
        if normalized is None:
            continue
        occupied_positions.add((normalized["x"], normalized["y"]))

    for x in APP_STORE_POSITION_COLUMNS:
        for y in APP_STORE_POSITION_ROWS:
            if (x, y) not in occupied_positions:
                return {"x": x, "y": y}

    return {"x": APP_STORE_POSITION_COLUMNS[0], "y": APP_STORE_POSITION_ROWS[0]}


async def _cleanup_legacy_desktop_state(
    db: AsyncSession,
    *,
    user_id: UUID,
    config_id: UUID | None = None,
) -> None:
    """Remove deprecated desktop app remnants left by older profiles/clients."""
    await db.execute(
        delete(UserInstalledApp).where(
            UserInstalledApp.user_id == user_id,
            UserInstalledApp.app_id.in_(tuple(_desktop().LEGACY_HIDDEN_DESKTOP_APP_IDS)),
        )
    )
    if config_id is None:
        config_result = await db.execute(select(DesktopConfig.id).where(DesktopConfig.user_id == user_id))
        config_id = config_result.scalar_one_or_none()
    if config_id is None:
        return
    await db.execute(
        delete(DesktopItem).where(
            DesktopItem.config_id == config_id,
            DesktopItem.item_id.in_(tuple(_desktop().LEGACY_HIDDEN_DESKTOP_APP_IDS)),
        )
    )
    await db.execute(
        delete(DesktopItem).where(
            DesktopItem.config_id == config_id,
            DesktopItem.app_component.in_(tuple(_desktop().LEGACY_HIDDEN_DESKTOP_APP_COMPONENTS)),
        )
    )


async def ensure_app_store_icon(db: AsyncSession, config: DesktopConfig) -> None:
    """Create or normalize the persistent App Store desktop icon."""
    result = await db.execute(select(DesktopItem).where(DesktopItem.config_id == config.id))
    items = result.scalars().all()
    app_store_items = [
        item
        for item in items
        if item.item_id == _desktop().APP_STORE_APP_ID or item.app_component == _desktop().APP_STORE_APP_COMPONENT
    ]

    if not app_store_items:
        ts = utc_now_naive()
        await db.execute(
            pg_insert(DesktopItem)
            .values(
                id=uuid4(),
                config_id=config.id,
                item_id=_desktop().APP_STORE_APP_ID,
                item_type=ItemType.APP,
                name=_desktop().APP_STORE_DISPLAY_NAME,
                position=_pick_app_store_position(items),
                is_system=True,
                system_key=None,
                color=None,
                gradient=None,
                is_pinned=True,
                app_component=_desktop().APP_STORE_APP_COMPONENT,
                parent_id=None,
                meta={},
                created_at=ts,
                updated_at=ts,
            )
            .on_conflict_do_nothing(index_elements=[DesktopItem.config_id, DesktopItem.item_id])
        )
        result = await db.execute(select(DesktopItem).where(DesktopItem.config_id == config.id))
        items = result.scalars().all()
        app_store_items = [
            item
            for item in items
            if item.item_id == _desktop().APP_STORE_APP_ID or item.app_component == _desktop().APP_STORE_APP_COMPONENT
        ]
        if not app_store_items:
            return

    app_store_items.sort(
        key=lambda item: (
            item.item_id != _desktop().APP_STORE_APP_ID,
            not getattr(item, "is_system", False),
            str(item.id),
        )
    )
    keep = app_store_items[0]
    keep_mut: Any = keep
    duplicates = app_store_items[1:]
    duplicate_ids = {item.id for item in duplicates}
    for duplicate in duplicates:
        await db.delete(duplicate)

    normalized_position = _normalize_item_position(keep.position)
    if _position_needs_normalization(keep.position):
        other_items = [item for item in items if item.id != keep.id and item.id not in duplicate_ids]
        normalized_position = _pick_app_store_position(other_items)

    if keep.item_id != _desktop().APP_STORE_APP_ID:
        keep_mut.item_id = _desktop().APP_STORE_APP_ID
    if keep.item_type != ItemType.APP:
        keep_mut.item_type = ItemType.APP
    if keep.name != _desktop().APP_STORE_DISPLAY_NAME:
        keep_mut.name = _desktop().APP_STORE_DISPLAY_NAME
    if keep.app_component != _desktop().APP_STORE_APP_COMPONENT:
        keep_mut.app_component = _desktop().APP_STORE_APP_COMPONENT
    if not getattr(keep, "is_system", False):
        keep_mut.is_system = True
    if keep.parent_id is not None:
        keep_mut.parent_id = None
    if normalized_position is not None:
        keep_mut.position = normalized_position
    await db.flush()


async def ensure_system_folders(db: AsyncSession, config: DesktopConfig) -> None:
    """Create system folders for the user if they do not exist."""
    ts = utc_now_naive()
    for key in SYSTEM_FOLDER_KEYS:
        # Race-safe: unique on (config_id, item_id); system folders use item_id == system_key
        result = await db.execute(
            select(DesktopItem).where(
                DesktopItem.config_id == config.id,
                DesktopItem.item_id == key,
            )
        )
        if result.scalar_one_or_none() is not None:
            continue
        sk_check = await db.execute(
            select(DesktopItem.id).where(
                DesktopItem.config_id == config.id,
                DesktopItem.system_key == key,
            )
        )
        if sk_check.scalar_one_or_none() is not None:
            continue
        name = SYSTEM_FOLDER_NAMES.get(key, key.capitalize())
        position = SYSTEM_FOLDER_DEFAULT_POSITIONS.get(key, {"x": 0, "y": 0})
        await db.execute(
            pg_insert(DesktopItem)
            .values(
                id=uuid4(),
                config_id=config.id,
                item_id=key,
                item_type=ItemType.FOLDER,
                name=name,
                is_system=True,
                system_key=key,
                position=position,
                color=None,
                gradient=None,
                is_pinned=False,
                app_component=None,
                parent_id=None,
                meta={},
                created_at=ts,
                updated_at=ts,
            )
            .on_conflict_do_nothing(
                index_elements=[DesktopItem.config_id, DesktopItem.item_id],
            )
        )
    await db.flush()
