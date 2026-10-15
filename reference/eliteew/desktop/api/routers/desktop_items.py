# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Desktop items/folders CRUD REST under parent ``/desktop`` router (GET/POST/PATCH/DELETE/PUT items).
# Invariants:
# - Mounted without extra prefix; OAuth2 on user routes; ``GET /items`` reconciles bootstrap + store policy.
# - Bootstrap via ``desktop_bootstrap``; store policy via lazy ``_desktop()`` from ``desktop``.
# Related:
# - api/routers/desktop_bootstrap.py
# - api/routers/desktop_shell.py (``Position``, ``_get_or_create_desktop_config_row``)
# - api/routers/desktop_workspace.py (parent mount aggregator)
# ---
"""Desktop items and folders API — CRUD, nesting, bulk replace."""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from api.core.auth import User as AuthUser
from api.core.database_manager import get_postgres_session
from api.core.oauth2_auth import require_oauth2_user
from api.models.database_models import Company, Project
from api.models.desktop import (
    DesktopAppCatalog,
    DesktopConfig,
    DesktopItem,
    ItemType,
    UserInstalledApp,
)
from api.routers.desktop_bootstrap import (
    SYSTEM_FOLDER_KEYS,
    _cleanup_legacy_desktop_state,
    ensure_app_store_icon,
    ensure_system_folders,
)
from api.routers.desktop_shell import Position, _get_or_create_desktop_config_row
from api.services.desktop_folder_icon import (
    merge_desktop_item_meta_for_write,
    sanitize_desktop_item_meta_for_persist,
)
from api.services.desktop_item_nesting import (
    build_parent_item_id_map,
    parent_item_id_for_row,
    resolve_parent_row_id,
    sort_items_for_bulk_insert,
)
from api.utils.json_safe import json_safe_api_detail
from api.utils.project_desktop_folder import parse_project_id_from_desktop_folder_item_id

router = APIRouter(tags=["desktop"])

_DEFAULT_POSITION = {"x": 20, "y": 20}


async def _get_desktop_user_id(
    current_user: AuthUser = Depends(require_oauth2_user),
    db: AsyncSession = Depends(get_postgres_session),
) -> UUID:
    from api.routers.desktop import get_desktop_user_id

    return await get_desktop_user_id(current_user=current_user, db=db)


def _desktop():
    from api.routers import desktop as d

    return d


# ============= Pydantic Schemas =============


class DesktopItemCreate(BaseModel):
    item_id: str
    item_type: ItemType
    name: str
    position: Position = Field(default_factory=lambda: Position(x=20, y=20))
    color: str | None = None
    gradient: str | None = None
    is_pinned: bool = False
    app_component: str | None = None
    parent_item_id: str | None = None
    meta: dict[str, Any] | None = None


class DesktopItemUpdate(BaseModel):
    name: str | None = None
    position: Position | None = None
    color: str | None = None
    gradient: str | None = None
    is_pinned: bool | None = None
    parent_item_id: str | None = None
    meta: dict[str, Any] | None = None


class DesktopItemUpsert(BaseModel):
    """Schema for upsert - all fields optional except for create"""

    item_id: str | None = None
    item_type: ItemType | None = None
    name: str | None = None
    position: Position | None = None
    color: str | None = None
    gradient: str | None = None
    is_pinned: bool | None = None
    app_component: str | None = None
    parent_item_id: str | None = None
    meta: dict[str, Any] | None = None


class DesktopItemResponse(BaseModel):
    id: UUID
    item_id: str
    item_type: ItemType
    name: str
    position: dict
    color: str | None
    gradient: str | None
    is_pinned: bool
    app_component: str | None
    parent_id: UUID | None = None
    parent_item_id: str | None = None
    is_system: bool = False
    system_key: str | None = None
    meta: dict[str, object] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def normalize_position(self) -> DesktopItemResponse:
        """Ensure position is never null/invalid so frontend does not place all icons at (0,0)."""
        pos = self.position
        if not pos or not isinstance(pos, dict):
            self.position = dict(_DEFAULT_POSITION)
            return self
        x = pos.get("x")
        y = pos.get("y")
        if x is None or y is None or not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            self.position = dict(_DEFAULT_POSITION)
            return self
        if int(x) < _DEFAULT_POSITION["x"] or int(y) < _DEFAULT_POSITION["y"]:
            self.position = dict(_DEFAULT_POSITION)
            return self
        self.position = {"x": int(x), "y": int(y)}
        return self

    @classmethod
    def from_row(cls, row: DesktopItem, *, parent_item_id: str | None) -> DesktopItemResponse:
        return cls(
            id=row.id,
            item_id=row.item_id,
            item_type=row.item_type,
            name=row.name,
            position=row.position if isinstance(row.position, dict) else dict(_DEFAULT_POSITION),
            color=row.color,
            gradient=row.gradient,
            is_pinned=bool(row.is_pinned),
            app_component=row.app_component,
            parent_id=row.parent_id,
            parent_item_id=parent_item_id,
            is_system=bool(getattr(row, "is_system", False)),
            system_key=getattr(row, "system_key", None),
            meta=getattr(row, "meta", None) if isinstance(getattr(row, "meta", None), dict) else {},
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


class DesktopItemsResponse(BaseModel):
    items: list[DesktopItemResponse]


class DesktopItemsBulkUpdate(BaseModel):
    items: list[DesktopItemCreate]


# ============= Helpers =============


async def _get_one_item_or_none(db: AsyncSession, config_id: UUID, item_id: str) -> DesktopItem | None:
    """Get exactly one DesktopItem by config_id and item_id. If duplicates exist, keep one and delete the rest."""
    result = await db.execute(
        select(DesktopItem).where(
            DesktopItem.config_id == config_id,
            DesktopItem.item_id == item_id,
        )
    )
    rows = result.scalars().all()
    if not rows:
        return None
    if len(rows) == 1:
        return rows[0]
    rows_sorted = sorted(rows, key=lambda r: (not getattr(r, "is_system", False), str(r.id)))
    keep = rows_sorted[0]
    for extra in rows_sorted[1:]:
        await db.delete(extra)
    await db.flush()
    return keep


async def _raise_if_project_desktop_folder_locked(
    db: AsyncSession,
    *,
    item_id: str,
    item_type: ItemType,
    meta: object | None,
) -> None:
    """Block removal while the linked tenant project is active (eliteew-proj-* folders)."""
    if item_type != ItemType.FOLDER:
        return
    proj_uuid = parse_project_id_from_desktop_folder_item_id(item_id)
    if proj_uuid is None:
        return
    raw_meta = meta if isinstance(meta, dict) else {}
    if raw_meta.get("project_guard_released"):
        return
    active = await db.execute(
        select(Project.id)
        .join(Company, Company.id == Project.company_id)
        .where(
            Project.id == proj_uuid,
            Project.deleted_at.is_(None),
            Company.deleted_at.is_(None),
        )
    )
    if active.scalar_one_or_none() is None:
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=json_safe_api_detail(
            {
                "code": "project_desktop_folder_locked",
                "message": (
                    "Нельзя удалить папку проекта, пока проект активен. "
                    "Сначала архивируйте проект в маркетинговом кабинете."
                ),
            }
        ),
    )


def _apply_desktop_item_meta_field(item: DesktopItem, incoming_meta: object | None) -> None:
    if incoming_meta is None:
        return
    if getattr(item, "is_system", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System folders cannot be customized",
        )
    allow_folder_icon = item.item_type == ItemType.FOLDER and not getattr(item, "is_system", False)
    item.meta = merge_desktop_item_meta_for_write(  # type: ignore[assignment]
        item.meta if isinstance(item.meta, dict) else {},
        incoming_meta if isinstance(incoming_meta, dict) else None,
        allow_folder_icon=allow_folder_icon,
    )
    flag_modified(item, "meta")


async def _require_user_may_persist_app_desktop_item(
    db: AsyncSession,
    *,
    user_id: UUID,
    item_id: str,
    item_type: ItemType,
    auth_user: AuthUser,
) -> None:
    """Reject creating/syncing a desktop shortcut for an app the user may not use."""
    if item_type != ItemType.APP:
        return
    if item_id == _desktop().APP_STORE_APP_ID:
        return
    if _desktop()._is_legacy_hidden_app_id(item_id):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="App is deprecated and no longer available as a desktop icon",
        )
    catalog_result = await db.execute(
        select(DesktopAppCatalog)
        .options(selectinload(DesktopAppCatalog.access_groups))
        .where(DesktopAppCatalog.app_id == item_id)
    )
    catalog_row = catalog_result.scalar_one_or_none()
    if catalog_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="App not found in catalog")
    if _desktop()._is_legacy_hidden_desktop_item(catalog_row.app_id, catalog_row.app_component):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="App is deprecated and no longer available as a desktop icon",
        )
    if not _desktop()._user_can_see_app(catalog_row, auth_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this app",
        )
    installed = await db.execute(
        select(UserInstalledApp.app_id).where(
            UserInstalledApp.user_id == user_id,
            UserInstalledApp.app_id == item_id,
        )
    )
    if installed.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="App is not installed for this user",
        )


def _items_response_with_parents(rows: list[DesktopItem]) -> DesktopItemsResponse:
    parent_map = build_parent_item_id_map(rows)
    return DesktopItemsResponse(
        items=[
            DesktopItemResponse.from_row(
                row,
                parent_item_id=parent_item_id_for_row(row, parent_map),
            )
            for row in rows
        ]
    )


async def _item_response_with_parent(
    db: AsyncSession,
    config_id: UUID,
    row: DesktopItem,
) -> DesktopItemResponse:
    parent_map = build_parent_item_id_map([row])
    parent_item_id = parent_item_id_for_row(row, parent_map)
    if parent_item_id is None and row.parent_id is not None:
        parent_res = await db.execute(
            select(DesktopItem.item_id).where(
                DesktopItem.config_id == config_id,
                DesktopItem.id == row.parent_id,
            )
        )
        parent_item_id = parent_res.scalar_one_or_none()
    return DesktopItemResponse.from_row(row, parent_item_id=parent_item_id)


# ============= Items Endpoints =============


@router.get("/items", response_model=DesktopItemsResponse)
async def get_items(
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Get all user's desktop items. Ensures system folders and App Store icon exist."""
    config = await _get_or_create_desktop_config_row(db, user_id)

    await _cleanup_legacy_desktop_state(db, user_id=user_id, config_id=config.id)
    await _desktop()._enforce_user_installed_apps_policy(db, user_id=user_id, current_user=current_user)

    installed_res = await db.execute(select(UserInstalledApp.app_id).where(UserInstalledApp.user_id == user_id))
    allowed_app_ids = {a for a in installed_res.scalars().all() if not _desktop()._is_legacy_hidden_app_id(a)}
    allowed_app_ids.add(_desktop().APP_STORE_APP_ID)
    await _desktop()._strip_unauthorized_app_desktop_items(db, config_id=config.id, allowed_app_ids=allowed_app_ids)

    await ensure_system_folders(db, config)
    await ensure_app_store_icon(db, config)
    await db.commit()
    await db.refresh(config)

    result = await db.execute(
        select(DesktopItem)
        .where(DesktopItem.config_id == config.id)
        .order_by(DesktopItem.item_type, DesktopItem.item_id)
    )
    items = result.scalars().all()

    return _items_response_with_parents(list(items))


@router.post("/items", response_model=DesktopItemResponse)
async def create_item(
    data: DesktopItemCreate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Create a desktop item"""
    if _desktop()._is_legacy_hidden_desktop_item(data.item_id, data.app_component):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="App is deprecated and no longer available as a desktop icon",
        )
    config_result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
    config = config_result.scalar_one_or_none()

    if not config:
        config = DesktopConfig(user_id=user_id)
        db.add(config)
        await db.flush()

    existing = await db.execute(
        select(DesktopItem).where(
            DesktopItem.config_id == config.id,
            DesktopItem.item_id == data.item_id,
        )
    )
    existing_item = existing.scalar_one_or_none()
    if existing_item is not None:
        await db.commit()
        await db.refresh(existing_item)
        return await _item_response_with_parent(db, config.id, existing_item)

    await _require_user_may_persist_app_desktop_item(
        db,
        user_id=user_id,
        item_id=data.item_id,
        item_type=data.item_type,
        auth_user=current_user,
    )

    resolved_parent_id = await resolve_parent_row_id(
        db,
        config.id,
        item_id=data.item_id,
        item_type=data.item_type,
        parent_item_id=data.parent_item_id,
    )

    item = DesktopItem(
        config_id=config.id,
        item_id=data.item_id,
        item_type=data.item_type,
        name=data.name,
        position=data.position.model_dump(),
        color=data.color,
        gradient=data.gradient,
        is_pinned=data.is_pinned,
        app_component=data.app_component,
        parent_id=resolved_parent_id,
        meta=sanitize_desktop_item_meta_for_persist(
            item_type=data.item_type,
            is_system=False,
            meta=data.meta if isinstance(data.meta, dict) else {},
        ),
    )

    db.add(item)
    try:
        await db.commit()
        await db.refresh(item)
    except IntegrityError:
        await db.rollback()
        again = await db.execute(
            select(DesktopItem).where(
                DesktopItem.config_id == config.id,
                DesktopItem.item_id == data.item_id,
            )
        )
        out = again.scalar_one_or_none()
        if out is not None:
            return await _item_response_with_parent(db, config.id, out)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Item already exists for this config",
        ) from None

    return await _item_response_with_parent(db, config.id, item)


@router.patch("/items/{item_id}", response_model=DesktopItemResponse)
async def update_item(
    item_id: str,
    data: DesktopItemUpdate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Update a desktop item"""
    config_result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
    config = config_result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Desktop config not found")

    item = await _get_one_item_or_none(db, config.id, item_id)

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    if getattr(item, "is_system", False) and "name" in (data.model_dump(exclude_unset=True) or {}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System folders cannot be renamed",
        )
    if getattr(item, "is_system", False) and "meta" in (data.model_dump(exclude_unset=True) or {}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System folders cannot be customized",
        )

    update_data = data.model_dump(exclude_unset=True)
    if "meta" in update_data:
        _apply_desktop_item_meta_field(item, update_data.pop("meta"))
    if "parent_item_id" in update_data:
        parent_wire = update_data.pop("parent_item_id")
        item.parent_id = await resolve_parent_row_id(  # type: ignore[assignment]
            db,
            config.id,
            item_id=item_id,
            item_type=item.item_type,
            parent_item_id=parent_wire,
            existing_row=item,
        )
    for field, value in update_data.items():
        if value is not None:
            if field == "position" and isinstance(value, Position):
                setattr(item, field, value.model_dump())
            else:
                setattr(item, field, value)

    await db.commit()
    await db.refresh(item)

    return await _item_response_with_parent(db, config.id, item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: str,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Delete a desktop item. System folders cannot be deleted. User folder deletion clears content links."""
    config_result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
    config = config_result.scalar_one_or_none()

    if not config:
        return

    item = await _get_one_item_or_none(db, config.id, item_id)

    if not item:
        return

    if getattr(item, "is_system", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System folders cannot be deleted",
        )

    if item.item_type == ItemType.FOLDER:
        await _raise_if_project_desktop_folder_locked(
            db,
            item_id=item_id,
            item_type=item.item_type,
            meta=getattr(item, "meta", None),
        )

        await db.execute(
            text(
                "UPDATE unified_content SET folder_item_id = NULL "
                "WHERE user_id = :user_id AND folder_item_id = :folder_item_id"
            ),
            {"user_id": str(user_id), "folder_item_id": item_id},
        )

    await db.execute(delete(DesktopItem).where(DesktopItem.config_id == config.id, DesktopItem.item_id == item_id))
    await db.commit()


@router.put("/items/{item_id}", response_model=DesktopItemResponse)
async def upsert_item(
    item_id: str,
    data: DesktopItemUpsert,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Create or update a desktop item (upsert)"""
    if _desktop()._is_legacy_hidden_desktop_item(item_id, data.app_component):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="App is deprecated and no longer available as a desktop icon",
        )
    config_result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
    config = config_result.scalar_one_or_none()

    if not config:
        config = DesktopConfig(user_id=user_id)
        db.add(config)
        await db.flush()

    item = await _get_one_item_or_none(db, config.id, item_id)

    if item:
        item_mut: Any = item
        upsert_data = data.model_dump(exclude_unset=True)
        if "parent_item_id" in upsert_data:
            item_mut.parent_id = await resolve_parent_row_id(
                db,
                config.id,
                item_id=item_id,
                item_type=item.item_type,
                parent_item_id=upsert_data["parent_item_id"],
                existing_row=item,
            )
        if data.name is not None:
            item_mut.name = data.name
        if data.position is not None:
            item_mut.position = data.position.model_dump()
        if data.color is not None:
            item_mut.color = data.color
        if data.gradient is not None:
            item_mut.gradient = data.gradient
        if data.is_pinned is not None:
            item_mut.is_pinned = data.is_pinned
        if data.app_component is not None:
            item_mut.app_component = data.app_component
        if data.meta is not None:
            _apply_desktop_item_meta_field(item_mut, data.meta)
    else:
        if data.item_type is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="item_type is required for new items")
        if data.name is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name is required for new items")
        await _require_user_may_persist_app_desktop_item(
            db,
            user_id=user_id,
            item_id=item_id,
            item_type=data.item_type,
            auth_user=current_user,
        )
        resolved_parent_id = await resolve_parent_row_id(
            db,
            config.id,
            item_id=item_id,
            item_type=data.item_type,
            parent_item_id=data.parent_item_id,
        )
        item = DesktopItem(
            config_id=config.id,
            item_id=item_id,
            item_type=data.item_type,
            name=data.name,
            position=data.position.model_dump() if data.position else dict(_DEFAULT_POSITION),
            color=data.color,
            gradient=data.gradient,
            is_pinned=data.is_pinned or False,
            app_component=data.app_component,
            parent_id=resolved_parent_id,
            meta=sanitize_desktop_item_meta_for_persist(
                item_type=data.item_type,
                is_system=False,
                meta=data.meta if isinstance(data.meta, dict) else {},
            ),
        )
        db.add(item)

    await db.commit()
    await db.refresh(item)

    return await _item_response_with_parent(db, config.id, item)


@router.put("/items", response_model=DesktopItemsResponse)
async def replace_items(
    data: DesktopItemsBulkUpdate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Replace all desktop items (bulk update)"""
    config_result = await db.execute(select(DesktopConfig).where(DesktopConfig.user_id == user_id))
    config = config_result.scalar_one_or_none()

    if not config:
        config = DesktopConfig(user_id=user_id)
        db.add(config)
        await db.flush()

    await _cleanup_legacy_desktop_state(db, user_id=user_id, config_id=config.id)

    incoming_item_ids: set[str] = set()
    for item_data in data.items:
        if _desktop()._is_legacy_hidden_desktop_item(item_data.item_id, item_data.app_component):
            continue
        incoming_item_ids.add(item_data.item_id)

    existing_non_system = await db.execute(
        select(DesktopItem).where(
            DesktopItem.config_id == config.id,
            DesktopItem.is_system.is_(False),
        )
    )
    for row in existing_non_system.scalars():
        if row.item_id in incoming_item_ids:
            continue
        await _raise_if_project_desktop_folder_locked(
            db,
            item_id=row.item_id,
            item_type=row.item_type,
            meta=getattr(row, "meta", None),
        )

    await db.execute(
        delete(DesktopItem).where(
            DesktopItem.config_id == config.id,
            DesktopItem.is_system.is_(False),
        )
    )
    await db.flush()

    item_data_by_id: dict[str, DesktopItemCreate] = {}
    system_item_updates: dict[str, DesktopItemCreate] = {}
    for item_data in data.items:
        if _desktop()._is_legacy_hidden_desktop_item(item_data.item_id, item_data.app_component):
            continue
        if item_data.item_id in SYSTEM_FOLDER_KEYS or item_data.item_id == _desktop().APP_STORE_APP_ID:
            system_item_updates[item_data.item_id] = item_data
            continue
        item_data_by_id[item_data.item_id] = item_data

    ordered_pairs = sort_items_for_bulk_insert([(row.item_id, row.parent_item_id) for row in item_data_by_id.values()])
    row_id_by_item_id: dict[str, UUID] = {}
    system_rows = await db.execute(
        select(DesktopItem).where(
            DesktopItem.config_id == config.id,
            DesktopItem.is_system.is_(True),
        )
    )
    for sys_row in system_rows.scalars():
        row_id_by_item_id[sys_row.item_id] = sys_row.id

    for item_id_key, _ in ordered_pairs:
        item_data = item_data_by_id[item_id_key]
        existing = await db.execute(
            select(DesktopItem).where(
                DesktopItem.config_id == config.id,
                DesktopItem.item_id == item_data.item_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            continue
        await _require_user_may_persist_app_desktop_item(
            db,
            user_id=user_id,
            item_id=item_data.item_id,
            item_type=item_data.item_type,
            auth_user=current_user,
        )
        parent_row_id: UUID | None = None
        if item_data.parent_item_id:
            parent_key = str(item_data.parent_item_id).strip()
            parent_row_id = row_id_by_item_id.get(parent_key)
            if parent_row_id is None:
                parent_row_id = await resolve_parent_row_id(
                    db,
                    config.id,
                    item_id=item_data.item_id,
                    item_type=item_data.item_type,
                    parent_item_id=parent_key,
                )

        item = DesktopItem(
            config_id=config.id,
            item_id=item_data.item_id,
            item_type=item_data.item_type,
            name=item_data.name,
            position=item_data.position.model_dump(),
            color=item_data.color,
            gradient=item_data.gradient,
            is_pinned=item_data.is_pinned,
            app_component=item_data.app_component,
            parent_id=parent_row_id,
            meta=sanitize_desktop_item_meta_for_persist(
                item_type=item_data.item_type,
                is_system=False,
                meta=item_data.meta if isinstance(item_data.meta, dict) else {},
            ),
        )
        db.add(item)
        await db.flush()
        row_id_by_item_id[item_data.item_id] = item.id

    await ensure_system_folders(db, config)
    await ensure_app_store_icon(db, config)
    for item_id, item_data in system_item_updates.items():
        system_item = await _get_one_item_or_none(db, config.id, item_id)
        if system_item is None:
            continue
        sys_mut: Any = system_item
        sys_mut.position = item_data.position.model_dump()
        sys_mut.parent_id = None
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        result = await db.execute(
            select(DesktopItem)
            .where(DesktopItem.config_id == config.id)
            .order_by(DesktopItem.item_type, DesktopItem.item_id)
        )
        items_list = result.scalars().all()
        return _items_response_with_parents(list(items_list))

    result = await db.execute(select(DesktopItem).where(DesktopItem.config_id == config.id))
    all_items = result.scalars().all()

    return _items_response_with_parents(list(all_items))
