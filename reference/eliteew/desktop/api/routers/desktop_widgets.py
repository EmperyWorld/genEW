# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Desktop dashboard widgets REST: sticky notes, todos, favorites, and Wave B
# ``POST /widget-sync`` (transactional batch + Redis Idempotency-Key).
# Invariants:
# - Mounted without extra prefix; OAuth2 on user-facing routes; URL paths unchanged vs monolithic desktop.py.
# - ``_get_desktop_user_id`` lazy-imports resolver from ``api.routers.desktop`` to avoid circular imports.
# - Widget-sync does not commit mid-batch; hard failure raises so session dependency rolls back.
# Related:
# - api/routers/desktop.py (parent router, items/catalog/content feed)
# - api/routers/desktop_shell.py (``Position`` wire model for note placement)
# - api/services/desktop_widget_sync.py
# ---
"""Desktop dashboard widgets API — notes, todos, favorites."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.auth import User as AuthUser
from api.core.database_manager import get_postgres_session
from api.core.oauth2_auth import require_oauth2_user
from api.models.desktop import DesktopWidgetNote, DesktopWidgetTodo, UserDashboardFavorite
from api.routers.desktop_shell import Position
from api.services.desktop_widget_sync import (
    WidgetSyncApplyError,
    WidgetSyncInProgressError,
    WidgetSyncRedisUnavailableError,
    WidgetSyncRequest,
    WidgetSyncResponse,
    apply_widget_sync_ops,
    claim_widget_sync_idempotency_key,
    get_widget_sync_idempotent_response,
    normalize_widget_sync_idempotency_key,
    release_widget_sync_idempotency_claim,
    remember_widget_sync_idempotent_response,
)

router = APIRouter(tags=["desktop"])


async def _get_desktop_user_id(
    current_user: AuthUser = Depends(require_oauth2_user),
    db: AsyncSession = Depends(get_postgres_session),
) -> UUID:
    from api.routers.desktop import get_desktop_user_id

    return await get_desktop_user_id(current_user=current_user, db=db)


# ============= Widget Notes Endpoints =============


class WidgetNoteCreate(BaseModel):
    content: str = ""
    color: str = "yellow"
    position: Position = Field(default_factory=lambda: Position(x=0, y=0))
    tags: list[str] = Field(default_factory=list)


class WidgetNoteUpdate(BaseModel):
    content: str | None = None
    color: str | None = None
    position: Position | None = None
    tags: list[str] | None = None


class WidgetNoteResponse(BaseModel):
    id: str
    content: str
    color: str
    position: dict
    tags: list
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("/widget-notes", response_model=list[WidgetNoteResponse])
async def get_widget_notes(
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Get all widget notes for current user."""
    result = await db.execute(select(DesktopWidgetNote).where(DesktopWidgetNote.user_id == user_id))
    notes = result.scalars().all()
    return [
        WidgetNoteResponse(
            id=str(n.id),
            content=n.content,
            color=n.color,
            position=n.position if isinstance(n.position, dict) else {"x": 0, "y": 0},
            tags=n.tags if isinstance(n.tags, list) else [],
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in notes
    ]


@router.post("/widget-notes", response_model=WidgetNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_widget_note(
    data: WidgetNoteCreate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Create a widget note."""
    note = DesktopWidgetNote(
        user_id=user_id,
        content=data.content,
        color=data.color,
        position=data.position.model_dump(),
        tags=data.tags,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return WidgetNoteResponse(
        id=str(note.id),
        content=note.content,
        color=note.color,
        position=note.position if isinstance(note.position, dict) else {"x": 0, "y": 0},
        tags=note.tags if isinstance(note.tags, list) else [],
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.patch("/widget-notes/{note_id}", response_model=WidgetNoteResponse)
async def update_widget_note(
    note_id: UUID,
    data: WidgetNoteUpdate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Update a widget note."""
    result = await db.execute(
        select(DesktopWidgetNote).where(
            and_(
                DesktopWidgetNote.id == note_id,
                DesktopWidgetNote.user_id == user_id,
            )
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(note, k, v.model_dump() if hasattr(v, "model_dump") else v)
    await db.commit()
    await db.refresh(note)
    return WidgetNoteResponse(
        id=str(note.id),
        content=note.content,
        color=note.color,
        position=note.position if isinstance(note.position, dict) else {"x": 0, "y": 0},
        tags=note.tags if isinstance(note.tags, list) else [],
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.delete("/widget-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_widget_note(
    note_id: UUID,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Delete a widget note."""
    res = await db.execute(
        select(DesktopWidgetNote).where(
            and_(
                DesktopWidgetNote.id == note_id,
                DesktopWidgetNote.user_id == user_id,
            )
        )
    )
    if res.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    await db.execute(
        delete(DesktopWidgetNote).where(
            and_(
                DesktopWidgetNote.id == note_id,
                DesktopWidgetNote.user_id == user_id,
            )
        )
    )
    await db.commit()


# ============= Widget Todos Endpoints =============


class WidgetTodoCreate(BaseModel):
    text: str
    completed: bool = False
    priority: str = "medium"
    tags: list[str] = Field(default_factory=list)


class WidgetTodoUpdate(BaseModel):
    text: str | None = None
    completed: bool | None = None
    priority: str | None = None
    tags: list[str] | None = None


class WidgetTodoResponse(BaseModel):
    id: str
    text: str
    completed: bool
    priority: str
    tags: list
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("/widget-todos", response_model=list[WidgetTodoResponse])
async def get_widget_todos(
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Get all widget todos for current user."""
    result = await db.execute(select(DesktopWidgetTodo).where(DesktopWidgetTodo.user_id == user_id))
    todos = result.scalars().all()
    return [
        WidgetTodoResponse(
            id=str(t.id),
            text=t.text,
            completed=t.completed,
            priority=t.priority,
            tags=t.tags if isinstance(t.tags, list) else [],
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in todos
    ]


@router.post("/widget-todos", response_model=WidgetTodoResponse, status_code=status.HTTP_201_CREATED)
async def create_widget_todo(
    data: WidgetTodoCreate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Create a widget todo."""
    todo = DesktopWidgetTodo(
        user_id=user_id,
        text=data.text,
        completed=data.completed,
        priority=data.priority,
        tags=data.tags,
    )
    db.add(todo)
    await db.commit()
    await db.refresh(todo)
    return WidgetTodoResponse(
        id=str(todo.id),
        text=todo.text,
        completed=todo.completed,
        priority=todo.priority,
        tags=todo.tags if isinstance(todo.tags, list) else [],
        created_at=todo.created_at,
        updated_at=todo.updated_at,
    )


@router.patch("/widget-todos/{todo_id}", response_model=WidgetTodoResponse)
async def update_widget_todo(
    todo_id: UUID,
    data: WidgetTodoUpdate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Update a widget todo."""
    result = await db.execute(
        select(DesktopWidgetTodo).where(
            and_(
                DesktopWidgetTodo.id == todo_id,
                DesktopWidgetTodo.user_id == user_id,
            )
        )
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(todo, k, v)
    await db.commit()
    await db.refresh(todo)
    return WidgetTodoResponse(
        id=str(todo.id),
        text=todo.text,
        completed=todo.completed,
        priority=todo.priority,
        tags=todo.tags if isinstance(todo.tags, list) else [],
        created_at=todo.created_at,
        updated_at=todo.updated_at,
    )


@router.delete("/widget-todos/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_widget_todo(
    todo_id: UUID,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Delete a widget todo."""
    await db.execute(
        delete(DesktopWidgetTodo).where(
            and_(
                DesktopWidgetTodo.id == todo_id,
                DesktopWidgetTodo.user_id == user_id,
            )
        )
    )
    await db.commit()


# ============= Dashboard Favorites (FavoritesWidget) =============


class DashboardFavoriteCreate(BaseModel):
    """Create dashboard favorite item."""

    title: str = Field(..., min_length=1, max_length=500)
    url: str = Field(default="#", max_length=1000)
    icon: str = Field(default="⭐", max_length=100)
    color: str = Field(default="from-pink-500/20 to-rose-500/20", max_length=200)


class DashboardFavoriteResponse(BaseModel):
    """Dashboard favorite item response."""

    id: str
    title: str
    url: str
    icon: str
    color: str
    sort_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DashboardFavoriteReorder(BaseModel):
    """Bulk reorder dashboard favorites (index in list = sort_order)."""

    favorite_ids: list[str] = Field(..., min_length=1)


@router.get("/favorites", response_model=list[DashboardFavoriteResponse])
async def get_dashboard_favorites(
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Get all dashboard favorites for current user."""
    result = await db.execute(
        select(UserDashboardFavorite)
        .where(UserDashboardFavorite.user_id == user_id)
        .order_by(UserDashboardFavorite.sort_order.asc(), UserDashboardFavorite.created_at.asc())
    )
    rows = result.scalars().all()
    return [
        DashboardFavoriteResponse(
            id=str(r.id),
            title=r.title,
            url=r.url,
            icon=r.icon,
            color=r.color,
            sort_order=r.sort_order,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/favorites", response_model=DashboardFavoriteResponse, status_code=status.HTTP_201_CREATED)
async def create_dashboard_favorite(
    data: DashboardFavoriteCreate,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Create a dashboard favorite."""
    result = await db.execute(
        select(UserDashboardFavorite)
        .where(UserDashboardFavorite.user_id == user_id)
        .order_by(UserDashboardFavorite.sort_order.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    sort_order = (last.sort_order + 1) if last is not None else 0
    fav = UserDashboardFavorite(
        user_id=user_id,
        title=data.title,
        url=data.url,
        icon=data.icon,
        color=data.color,
        sort_order=sort_order,
    )
    db.add(fav)
    await db.commit()
    await db.refresh(fav)
    return DashboardFavoriteResponse(
        id=str(fav.id),
        title=fav.title,
        url=fav.url,
        icon=fav.icon,
        color=fav.color,
        sort_order=fav.sort_order,
        created_at=fav.created_at,
    )


@router.patch("/favorites/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_dashboard_favorites(
    data: DashboardFavoriteReorder,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Bulk reorder dashboard favorites; list order becomes sort_order 0..n-1."""
    try:
        parsed_ids = [UUID(favorite_id) for favorite_id in data.favorite_ids]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid favorite id") from exc

    if len(parsed_ids) != len(set(parsed_ids)):
        raise HTTPException(status_code=422, detail="Duplicate favorite ids")

    result = await db.execute(select(UserDashboardFavorite).where(UserDashboardFavorite.user_id == user_id))
    rows = {row.id: row for row in result.scalars().all()}
    if set(parsed_ids) != set(rows.keys()):
        raise HTTPException(
            status_code=400,
            detail="favorite_ids must include every favorite for the current user",
        )

    for index, favorite_id in enumerate(parsed_ids):
        rows[favorite_id].sort_order = index  # type: ignore[assignment]

    await db.commit()


@router.delete("/favorites/{favorite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard_favorite(
    favorite_id: UUID,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
):
    """Delete a dashboard favorite."""
    await db.execute(
        delete(UserDashboardFavorite).where(
            and_(
                UserDashboardFavorite.id == favorite_id,
                UserDashboardFavorite.user_id == user_id,
            )
        )
    )
    await db.commit()


# ============= Wave B: transactional widget-sync =============


@router.post("/widget-sync", response_model=WidgetSyncResponse)
async def sync_desktop_widgets(
    body: WidgetSyncRequest,
    request: Request,
    current_user: AuthUser = Depends(require_oauth2_user),
    user_id: UUID = Depends(_get_desktop_user_id),
    db: AsyncSession = Depends(get_postgres_session),
    idempotency_key_header: str | None = Header(default=None, alias="Idempotency-Key"),
):
    """
    Apply a batch of widget mutations in one Postgres transaction.

    Requires ``Idempotency-Key`` (or ``X-Idempotency-Key``). Redis caches the success
    payload for safe retry after network drop mid-response. Failures raise so the
    session dependency rolls back the entire batch (outbox must stay intact client-side).
    """
    _ = current_user
    idem_raw = normalize_widget_sync_idempotency_key(
        idempotency_key_header or request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
    )
    if not idem_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header required (8–128 chars)",
        )

    try:
        cached = await get_widget_sync_idempotent_response(user_id, idem_raw)
    except WidgetSyncInProgressError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="widget-sync with this Idempotency-Key is already in progress",
        ) from exc
    except WidgetSyncRedisUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="widget-sync idempotency store unavailable; keep outbox and retry",
        ) from exc

    if cached is not None:
        return WidgetSyncResponse.model_validate(cached)

    try:
        claimed = await claim_widget_sync_idempotency_key(user_id, idem_raw)
    except WidgetSyncRedisUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="widget-sync idempotency store unavailable; keep outbox and retry",
        ) from exc

    if not claimed:
        # Lost race after miss — treat as in-progress or try replay again.
        try:
            cached_again = await get_widget_sync_idempotent_response(user_id, idem_raw)
        except WidgetSyncInProgressError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="widget-sync with this Idempotency-Key is already in progress",
            ) from exc
        except WidgetSyncRedisUnavailableError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="widget-sync idempotency store unavailable; keep outbox and retry",
            ) from exc
        if cached_again is not None:
            return WidgetSyncResponse.model_validate(cached_again)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="widget-sync with this Idempotency-Key is already in progress",
        )

    try:
        results = await apply_widget_sync_ops(db, user_id, body.ops)
        response = WidgetSyncResponse(results=results)
        # Flush only — session dependency commits on successful return.
        await db.flush()
    except WidgetSyncApplyError as exc:
        await db.rollback()
        await release_widget_sync_idempotency_claim(user_id, idem_raw)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc) or "widget-sync apply failed",
        ) from exc
    except Exception as exc:
        await db.rollback()
        await release_widget_sync_idempotency_claim(user_id, idem_raw)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="widget-sync apply failed",
        ) from exc

    await remember_widget_sync_idempotent_response(user_id, idem_raw, response)
    return response
