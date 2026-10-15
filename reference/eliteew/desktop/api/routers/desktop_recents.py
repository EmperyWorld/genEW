# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Desktop recent activity REST: recent files and multi-slice content feed under parent ``/desktop`` router.
# Invariants:
# - Mounted without extra prefix; OAuth2 on user-facing routes; URL paths unchanged vs monolithic workspace.
# - ``_get_desktop_user_id`` lazy-imports resolver from ``api.routers.desktop`` to avoid circular imports.
# Related:
# - api/routers/desktop_workspace.py (parent mount for items + bootstrap)
# - api/routers/desktop.py (top-level desktop router)
# ---
"""Desktop recent files and content feed API."""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.auth import User as AuthUser
from api.core.database_manager import get_postgres_session
from api.core.oauth2_auth import require_oauth2_user

router = APIRouter(tags=["desktop"])

RECENT_FILES_LIMIT = 10
# Generated content: unified_content rows tagged by a producing service (studio, UGS, …).
# Exclude avatars and operator-linked product assets from the "generations" slice.
RECENT_FEED_GENERATED_EXCLUDE_SOURCE_SERVICES = ("user_profile", "product_desktop")

CONTENT_TYPE_TO_RECENT_TYPE = {
    "document": "document",
    "image": "image",
    "video": "video",
    "audio": "audio",
    "presentation": "document",
    "analysis": "document",
    "other": "document",
}


async def _get_desktop_user_id(
    current_user: AuthUser = Depends(require_oauth2_user),
    db: AsyncSession = Depends(get_postgres_session),
) -> UUID:
    from api.routers.desktop import get_desktop_user_id

    return await get_desktop_user_id(current_user=current_user, db=db)


class DesktopRecentFileRow(BaseModel):
    """Row shape for GET /desktop/recent-files and slices in /desktop/recent-content-feed."""

    id: str
    name: str
    type: str
    path: str
    openedAt: str


class DesktopRecentContentFeedResponse(BaseModel):
    opened: list[DesktopRecentFileRow]
    added: list[DesktopRecentFileRow]
    generated: list[DesktopRecentFileRow]
    uploaded: list[DesktopRecentFileRow]
    projects: list[DesktopRecentFileRow]


def _map_unified_recent_rows(rows) -> list[dict[str, Any]]:
    """Same row shape as GET /desktop/recent-files."""
    out: list[dict[str, Any]] = []
    for row in rows.mappings():
        content_type = (row.get("content_type") or "document") or "document"
        recent_type = CONTENT_TYPE_TO_RECENT_TYPE.get(content_type, "document")
        opened_at = row.get("opened_at")
        if isinstance(opened_at, datetime):
            opened_s = opened_at.isoformat()
        elif opened_at is None:
            opened_s = ""
        else:
            opened_s = str(opened_at)
        out.append(
            {
                "id": str(row["id"]),
                "name": (row["name"] or "Без названия").strip() or "Без названия",
                "type": recent_type,
                "path": f"#/content/{row['id']}",
                "openedAt": opened_s,
            }
        )
    return out


def _map_project_recent_rows(rows) -> list[dict[str, Any]]:
    """User-owned marketing projects — same envelope as recent files, type=project."""
    out: list[dict[str, Any]] = []
    for row in rows.mappings():
        opened_at = row.get("opened_at")
        if isinstance(opened_at, datetime):
            opened_s = opened_at.isoformat()
        elif opened_at is None:
            opened_s = ""
        else:
            opened_s = str(opened_at)
        name = (row.get("name") or "").strip() or "Без названия"
        out.append(
            {
                "id": str(row["id"]),
                "name": name,
                "type": "project",
                "path": "",
                "openedAt": opened_s,
            }
        )
    return out


async def fetch_recent_files_for_user(
    db: AsyncSession,
    user_id: UUID,
    *,
    limit: int = RECENT_FILES_LIMIT,
) -> list[dict[str, Any]]:
    """Recent files rows for GET /recent-files and shell-bootstrap."""
    if limit < 1 or limit > 50:
        limit = RECENT_FILES_LIMIT
    rows = await db.execute(
        text("""
            SELECT id, COALESCE(title, name, '') AS name, content_type,
                   COALESCE(last_accessed_at, updated_at) AS opened_at
            FROM unified_content
            WHERE user_id = :user_id AND deleted_at IS NULL
            ORDER BY COALESCE(last_accessed_at, updated_at) DESC NULLS LAST
            LIMIT :lim
        """),
        {"user_id": str(user_id), "lim": limit},
    )
    return _map_unified_recent_rows(rows)


async def fetch_recent_content_feed_for_user(
    db: AsyncSession,
    user_id: UUID,
    *,
    limit: int = 6,
) -> DesktopRecentContentFeedResponse:
    """Multi-slice feed for GET /recent-content-feed and shell-bootstrap."""
    if limit < 1 or limit > 30:
        limit = 6
    user_id_str = str(user_id)
    opened_res = await db.execute(
        text("""
            SELECT id, COALESCE(title, name, '') AS name, content_type,
                   COALESCE(last_accessed_at, updated_at) AS opened_at
            FROM unified_content
            WHERE user_id = :user_id AND deleted_at IS NULL
            ORDER BY COALESCE(last_accessed_at, updated_at) DESC NULLS LAST
            LIMIT :lim
        """),
        {"user_id": user_id_str, "lim": limit},
    )
    added_res = await db.execute(
        text("""
            SELECT id, COALESCE(title, name, '') AS name, content_type,
                   created_at AS opened_at
            FROM unified_content
            WHERE user_id = :user_id AND deleted_at IS NULL
            ORDER BY created_at DESC NULLS LAST
            LIMIT :lim
        """),
        {"user_id": user_id_str, "lim": limit},
    )
    gen_exclude = RECENT_FEED_GENERATED_EXCLUDE_SOURCE_SERVICES
    generated_res = await db.execute(
        text(f"""
            SELECT id, COALESCE(title, name, '') AS name, content_type,
                   created_at AS opened_at
            FROM unified_content
            WHERE user_id = :user_id AND deleted_at IS NULL
              AND COALESCE(BTRIM(source_service), '') <> ''
              AND source_service NOT IN ({",".join(f":gex_{i}" for i in range(len(gen_exclude)))})
            ORDER BY created_at DESC NULLS LAST
            LIMIT :lim
        """),
        {**{f"gex_{i}": gen_exclude[i] for i in range(len(gen_exclude))}, "user_id": user_id_str, "lim": limit},
    )
    uploaded_res = await db.execute(
        text("""
            SELECT id, COALESCE(title, name, '') AS name, content_type,
                   created_at AS opened_at
            FROM unified_content
            WHERE user_id = :user_id AND deleted_at IS NULL
              AND (source_service IS NULL OR BTRIM(source_service) = '')
              AND COALESCE(sub_type, '') <> 'gaf_chat_voice'
            ORDER BY created_at DESC NULLS LAST
            LIMIT :lim
        """),
        {"user_id": user_id_str, "lim": limit},
    )
    projects_res = await db.execute(
        text("""
            SELECT p.id, p.name AS name,
                   COALESCE(p.updated_at, p.created_at) AS opened_at
            FROM projects p
            INNER JOIN companies c ON p.company_id = c.id
            WHERE p.deleted_at IS NULL
              AND c.deleted_at IS NULL
              AND c.user_id = :user_id
            ORDER BY COALESCE(p.updated_at, p.created_at) DESC NULLS LAST
            LIMIT :lim
        """),
        {"user_id": user_id_str, "lim": limit},
    )
    return DesktopRecentContentFeedResponse(
        opened=_map_unified_recent_rows(opened_res),
        added=_map_unified_recent_rows(added_res),
        generated=_map_unified_recent_rows(generated_res),
        uploaded=_map_unified_recent_rows(uploaded_res),
        projects=_map_project_recent_rows(projects_res),
    )


@router.get("/recent-files", response_model=list[DesktopRecentFileRow])
async def get_recent_files(
    limit: int = 10,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """
    Recent files for Desktop (Start menu, WidgetsPanel).
    From unified_content, ordered by last_accessed_at (fallback updated_at).
    Returns shape: id, name, type (document|image|video|audio), path, openedAt (ISO).
    """
    return await fetch_recent_files_for_user(db, user_id, limit=limit)


@router.get("/recent-content-feed", response_model=DesktopRecentContentFeedResponse)
async def get_recent_content_feed(
    limit: int = 6,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """
    Library slices for Start / Quick Search:
    - opened: last access or update
    - added: newest by created_at (any origin)
    - generated: rows with non-empty source_service (studio, UGS, …), excluding avatars/product_desktop
    - uploaded: rows without source_service (user uploads / imports), excluding hidden GAF voice clips
    - projects: user's marketing projects (companies.user_id), by updated_at / created_at
    """
    return await fetch_recent_content_feed_for_user(db, user_id, limit=limit)
