# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Wave B desktop widget-sync: Redis Idempotency-Key helpers + transactional apply of
# note/todo/favorite ops (caller owns commit/rollback; no intermediate commits).
# Invariants:
# - Redis-only idempotency (no PG table); fail-closed when key present and Redis down.
# - Apply never calls commit — session dependency rolls back on raised errors.
# Related:
# - api/routers/desktop_widgets.py (POST /widget-sync)
# - documentation/product/desktop/DESKTOP-STATE-PERSISTENCE.md
# ---
"""Desktop widget-sync batch apply + Redis idempotency (Wave B)."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field
from redis.exceptions import RedisError
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.desktop import DesktopWidgetNote, DesktopWidgetTodo, UserDashboardFavorite
from api.utils.datetime_helpers import utc_now_naive

logger = logging.getLogger(__name__)

WIDGET_SYNC_IDEMPOTENCY_TTL_SEC = 86400
WIDGET_SYNC_IDEMPOTENCY_KEY_MIN_LEN = 8
WIDGET_SYNC_IDEMPOTENCY_KEY_MAX_LEN = 128
WIDGET_SYNC_IDEMPOTENCY_REDIS_PREFIX = "desktop_widget_sync:"
WIDGET_SYNC_IN_PROGRESS_MARKER = "in_progress"
WIDGET_SYNC_MAX_OPS = 200

WidgetSyncOpKind = Literal[
    "note_create",
    "note_update",
    "note_delete",
    "todo_create",
    "todo_update",
    "todo_delete",
    "favorite_create",
    "favorite_delete",
    "favorite_reorder",
]

WidgetSyncOpStatus = Literal["applied", "skipped_lww", "noop", "error"]


class WidgetSyncOp(BaseModel):
    """One mutation in a widget-sync batch."""

    op_id: str = Field(..., min_length=1, max_length=128)
    kind: WidgetSyncOpKind
    client_id: str | None = Field(default=None, max_length=128)
    server_id: str | None = Field(default=None, max_length=128)
    ts: datetime | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class WidgetSyncRequest(BaseModel):
    ops: list[WidgetSyncOp] = Field(default_factory=list, max_length=WIDGET_SYNC_MAX_OPS)


class WidgetSyncOpResult(BaseModel):
    op_id: str
    status: WidgetSyncOpStatus
    server_id: str | None = None
    detail: str | None = None

    model_config = ConfigDict(from_attributes=True)


class WidgetSyncResponse(BaseModel):
    results: list[WidgetSyncOpResult]


class WidgetSyncRedisUnavailableError(RuntimeError):
    """Redis required for Idempotency-Key but unavailable (fail-closed)."""


class WidgetSyncInProgressError(RuntimeError):
    """Same Idempotency-Key is currently being processed."""


class WidgetSyncApplyError(RuntimeError):
    """Hard failure inside batch apply — caller must rollback."""


def normalize_widget_sync_idempotency_key(raw: str | None) -> str | None:
    if not raw:
        return None
    s = raw.strip()
    if len(s) < WIDGET_SYNC_IDEMPOTENCY_KEY_MIN_LEN or len(s) > WIDGET_SYNC_IDEMPOTENCY_KEY_MAX_LEN:
        return None
    return s


def widget_sync_idempotency_redis_key(user_id: UUID, idem_key: str) -> str:
    digest = hashlib.sha256(idem_key.encode("utf-8")).hexdigest()[:40]
    return f"{WIDGET_SYNC_IDEMPOTENCY_REDIS_PREFIX}{user_id}:{digest}"


async def _redis_client() -> Any:
    from api.core.database_manager import get_database_manager  # noqa: PLC0415

    manager = await get_database_manager()
    return await manager.get_redis_client()


async def get_widget_sync_idempotent_response(user_id: UUID, idem_key: str) -> dict[str, Any] | None:
    """Return cached JSON body, or None on miss. Raises if Redis down or in_progress."""
    rkey = widget_sync_idempotency_redis_key(user_id, idem_key)
    try:
        redis_client = await _redis_client()
        raw = await redis_client.get(rkey)
    except Exception as exc:  # noqa: BLE001 — fail-closed boundary
        logger.warning("widget_sync idempotency get failed: %s", exc, exc_info=True)
        raise WidgetSyncRedisUnavailableError("widget_sync idempotency store unavailable") from exc

    if not raw:
        return None
    if isinstance(raw, bytes | bytearray):
        raw = raw.decode("utf-8")
    text = str(raw)
    if text == WIDGET_SYNC_IN_PROGRESS_MARKER:
        raise WidgetSyncInProgressError("widget_sync Idempotency-Key in progress")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("widget_sync idempotency corrupt payload; treating as miss")
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


async def claim_widget_sync_idempotency_key(user_id: UUID, idem_key: str) -> bool:
    """SET NX in_progress. True if claimed; False if key already exists."""
    rkey = widget_sync_idempotency_redis_key(user_id, idem_key)
    try:
        redis_client = await _redis_client()
        ok = await redis_client.set(
            rkey,
            WIDGET_SYNC_IN_PROGRESS_MARKER,
            nx=True,
            ex=WIDGET_SYNC_IDEMPOTENCY_TTL_SEC,
        )
        return bool(ok)
    except Exception as exc:  # noqa: BLE001
        logger.warning("widget_sync idempotency claim failed: %s", exc, exc_info=True)
        raise WidgetSyncRedisUnavailableError("widget_sync idempotency store unavailable") from exc


async def remember_widget_sync_idempotent_response(user_id: UUID, idem_key: str, response: WidgetSyncResponse) -> None:
    rkey = widget_sync_idempotency_redis_key(user_id, idem_key)
    payload = json.dumps(response.model_dump(mode="json"))
    try:
        redis_client = await _redis_client()
        await redis_client.setex(rkey, WIDGET_SYNC_IDEMPOTENCY_TTL_SEC, payload)
    except Exception as exc:  # noqa: BLE001
        # Commit already happened; log only — replay may re-apply without cache.
        logger.warning("widget_sync idempotency remember failed after commit: %s", exc, exc_info=True)


async def release_widget_sync_idempotency_claim(user_id: UUID, idem_key: str) -> None:
    """Delete in_progress marker so a failed attempt can retry with the same key."""
    rkey = widget_sync_idempotency_redis_key(user_id, idem_key)
    try:
        redis_client = await _redis_client()
        raw = await redis_client.get(rkey)
        if isinstance(raw, bytes | bytearray):
            raw = raw.decode("utf-8")
        if str(raw) == WIDGET_SYNC_IN_PROGRESS_MARKER:
            await redis_client.delete(rkey)
    except (RedisError, OSError, RuntimeError, TypeError, ValueError) as exc:
        logger.debug("[STEP] widget_sync_idempotency_release_skip: %s", exc)


def _parse_uuid(raw: str | None) -> UUID | None:
    if not raw:
        return None
    try:
        return UUID(str(raw))
    except TypeError, ValueError:
        return None


def _server_newer_than_op(entity_updated_at: datetime | None, op_ts: datetime | None) -> bool:
    if entity_updated_at is None or op_ts is None:
        return False
    left = entity_updated_at.replace(tzinfo=None) if entity_updated_at.tzinfo else entity_updated_at
    right = op_ts.replace(tzinfo=None) if op_ts.tzinfo else op_ts
    return left > right


async def apply_widget_sync_ops(
    db: AsyncSession,
    user_id: UUID,
    ops: list[WidgetSyncOp],
) -> list[WidgetSyncOpResult]:
    """
    Apply all ops against ``db`` without committing.
    Raises ``WidgetSyncApplyError`` on hard failure (caller rolls back entire batch).
    """
    if len(ops) > WIDGET_SYNC_MAX_OPS:
        raise WidgetSyncApplyError(f"ops exceed max {WIDGET_SYNC_MAX_OPS}")

    results: list[WidgetSyncOpResult] = []
    deferred_reorder: list[WidgetSyncOp] = []

    for op in ops:
        if op.kind == "favorite_reorder":
            deferred_reorder.append(op)
            continue
        results.append(await _apply_one_op(db, user_id, op))

    for op in deferred_reorder:
        results.append(await _apply_favorite_reorder(db, user_id, op))

    await db.flush()
    return results


async def _apply_one_op(db: AsyncSession, user_id: UUID, op: WidgetSyncOp) -> WidgetSyncOpResult:
    try:
        if op.kind == "note_create":
            return await _note_create(db, user_id, op)
        if op.kind == "note_update":
            return await _note_update(db, user_id, op)
        if op.kind == "note_delete":
            return await _note_delete(db, user_id, op)
        if op.kind == "todo_create":
            return await _todo_create(db, user_id, op)
        if op.kind == "todo_update":
            return await _todo_update(db, user_id, op)
        if op.kind == "todo_delete":
            return await _todo_delete(db, user_id, op)
        if op.kind == "favorite_create":
            return await _favorite_create(db, user_id, op)
        if op.kind == "favorite_delete":
            return await _favorite_delete(db, user_id, op)
        raise WidgetSyncApplyError(f"unsupported op kind: {op.kind}")
    except WidgetSyncApplyError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise WidgetSyncApplyError(f"op {op.op_id} failed: {exc}") from exc


async def _note_create(db: AsyncSession, user_id: UUID, op: WidgetSyncOp) -> WidgetSyncOpResult:
    note_id = _parse_uuid(op.client_id) or uuid4()
    payload = op.payload or {}
    position = payload.get("position")
    if not isinstance(position, dict):
        position = {"x": 0, "y": 0}
    tags = payload.get("tags") if isinstance(payload.get("tags"), list) else []
    note = DesktopWidgetNote(
        id=note_id,
        user_id=user_id,
        content=str(payload.get("content") or ""),
        color=str(payload.get("color") or "yellow"),
        position=position,
        tags=tags,
        created_at=utc_now_naive(),
        updated_at=utc_now_naive(),
    )
    db.add(note)
    return WidgetSyncOpResult(op_id=op.op_id, status="applied", server_id=str(note_id))


async def _note_update(db: AsyncSession, user_id: UUID, op: WidgetSyncOp) -> WidgetSyncOpResult:
    note_id = _parse_uuid(op.server_id)
    if note_id is None:
        raise WidgetSyncApplyError(f"{op.op_id}: note_update missing server_id")
    result = await db.execute(
        select(DesktopWidgetNote).where(and_(DesktopWidgetNote.id == note_id, DesktopWidgetNote.user_id == user_id))
    )
    note = result.scalar_one_or_none()
    if note is None:
        return WidgetSyncOpResult(op_id=op.op_id, status="noop", detail="note not found")
    if _server_newer_than_op(note.updated_at, op.ts):
        return WidgetSyncOpResult(
            op_id=op.op_id,
            status="skipped_lww",
            server_id=str(note.id),
            detail="server updated_at newer than op.ts",
        )
    payload = op.payload or {}
    if "content" in payload:
        note.content = str(payload.get("content") or "")  # type: ignore[assignment]
    if "color" in payload and payload["color"] is not None:
        note.color = str(payload["color"])  # type: ignore[assignment]
    if "position" in payload and isinstance(payload["position"], dict):
        note.position = payload["position"]  # type: ignore[assignment]
    if "tags" in payload and isinstance(payload["tags"], list):
        note.tags = payload["tags"]  # type: ignore[assignment]
    note.updated_at = utc_now_naive()  # type: ignore[assignment]
    return WidgetSyncOpResult(op_id=op.op_id, status="applied", server_id=str(note.id))


async def _note_delete(db: AsyncSession, user_id: UUID, op: WidgetSyncOp) -> WidgetSyncOpResult:
    note_id = _parse_uuid(op.server_id)
    if note_id is None:
        raise WidgetSyncApplyError(f"{op.op_id}: note_delete missing server_id")
    res = await db.execute(
        delete(DesktopWidgetNote).where(and_(DesktopWidgetNote.id == note_id, DesktopWidgetNote.user_id == user_id))
    )
    if int(getattr(res, "rowcount", 0) or 0) == 0:
        return WidgetSyncOpResult(op_id=op.op_id, status="noop", detail="note not found")
    return WidgetSyncOpResult(op_id=op.op_id, status="applied", server_id=str(note_id))


async def _todo_create(db: AsyncSession, user_id: UUID, op: WidgetSyncOp) -> WidgetSyncOpResult:
    todo_id = _parse_uuid(op.client_id) or uuid4()
    payload = op.payload or {}
    text = str(payload.get("text") or "").strip()
    if not text:
        raise WidgetSyncApplyError(f"{op.op_id}: todo_create requires text")
    tags = payload.get("tags") if isinstance(payload.get("tags"), list) else []
    todo = DesktopWidgetTodo(
        id=todo_id,
        user_id=user_id,
        text=text,
        completed=bool(payload.get("completed", False)),
        priority=str(payload.get("priority") or "medium"),
        tags=tags,
        created_at=utc_now_naive(),
        updated_at=utc_now_naive(),
    )
    db.add(todo)
    return WidgetSyncOpResult(op_id=op.op_id, status="applied", server_id=str(todo_id))


async def _todo_update(db: AsyncSession, user_id: UUID, op: WidgetSyncOp) -> WidgetSyncOpResult:
    todo_id = _parse_uuid(op.server_id)
    if todo_id is None:
        raise WidgetSyncApplyError(f"{op.op_id}: todo_update missing server_id")
    result = await db.execute(
        select(DesktopWidgetTodo).where(and_(DesktopWidgetTodo.id == todo_id, DesktopWidgetTodo.user_id == user_id))
    )
    todo = result.scalar_one_or_none()
    if todo is None:
        return WidgetSyncOpResult(op_id=op.op_id, status="noop", detail="todo not found")
    if _server_newer_than_op(todo.updated_at, op.ts):
        return WidgetSyncOpResult(
            op_id=op.op_id,
            status="skipped_lww",
            server_id=str(todo.id),
            detail="server updated_at newer than op.ts",
        )
    payload = op.payload or {}
    if "text" in payload and payload["text"] is not None:
        todo.text = str(payload["text"])  # type: ignore[assignment]
    if "completed" in payload and payload["completed"] is not None:
        todo.completed = bool(payload["completed"])  # type: ignore[assignment]
    if "priority" in payload and payload["priority"] is not None:
        todo.priority = str(payload["priority"])  # type: ignore[assignment]
    if "tags" in payload and isinstance(payload["tags"], list):
        todo.tags = payload["tags"]  # type: ignore[assignment]
    todo.updated_at = utc_now_naive()  # type: ignore[assignment]
    return WidgetSyncOpResult(op_id=op.op_id, status="applied", server_id=str(todo.id))


async def _todo_delete(db: AsyncSession, user_id: UUID, op: WidgetSyncOp) -> WidgetSyncOpResult:
    todo_id = _parse_uuid(op.server_id)
    if todo_id is None:
        raise WidgetSyncApplyError(f"{op.op_id}: todo_delete missing server_id")
    res = await db.execute(
        delete(DesktopWidgetTodo).where(and_(DesktopWidgetTodo.id == todo_id, DesktopWidgetTodo.user_id == user_id))
    )
    if int(getattr(res, "rowcount", 0) or 0) == 0:
        return WidgetSyncOpResult(op_id=op.op_id, status="noop", detail="todo not found")
    return WidgetSyncOpResult(op_id=op.op_id, status="applied", server_id=str(todo_id))


async def _favorite_create(db: AsyncSession, user_id: UUID, op: WidgetSyncOp) -> WidgetSyncOpResult:
    fav_id = _parse_uuid(op.client_id) or uuid4()
    payload = op.payload or {}
    title = str(payload.get("title") or "").strip()
    if not title:
        raise WidgetSyncApplyError(f"{op.op_id}: favorite_create requires title")
    result = await db.execute(
        select(UserDashboardFavorite)
        .where(UserDashboardFavorite.user_id == user_id)
        .order_by(UserDashboardFavorite.sort_order.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    sort_order = (last.sort_order + 1) if last is not None else 0
    fav = UserDashboardFavorite(
        id=fav_id,
        user_id=user_id,
        title=title,
        url=str(payload.get("url") or "#"),
        icon=str(payload.get("icon") or "star"),
        color=str(payload.get("color") or "from-pink-500/20 to-rose-500/20"),
        sort_order=sort_order,
        created_at=utc_now_naive(),
    )
    db.add(fav)
    return WidgetSyncOpResult(op_id=op.op_id, status="applied", server_id=str(fav_id))


async def _favorite_delete(db: AsyncSession, user_id: UUID, op: WidgetSyncOp) -> WidgetSyncOpResult:
    fav_id = _parse_uuid(op.server_id)
    if fav_id is None:
        raise WidgetSyncApplyError(f"{op.op_id}: favorite_delete missing server_id")
    res = await db.execute(
        delete(UserDashboardFavorite).where(
            and_(UserDashboardFavorite.id == fav_id, UserDashboardFavorite.user_id == user_id)
        )
    )
    if int(getattr(res, "rowcount", 0) or 0) == 0:
        return WidgetSyncOpResult(op_id=op.op_id, status="noop", detail="favorite not found")
    return WidgetSyncOpResult(op_id=op.op_id, status="applied", server_id=str(fav_id))


async def _apply_favorite_reorder(db: AsyncSession, user_id: UUID, op: WidgetSyncOp) -> WidgetSyncOpResult:
    payload = op.payload or {}
    raw_ids = payload.get("favorite_ids")
    if not isinstance(raw_ids, list) or not raw_ids:
        raise WidgetSyncApplyError(f"{op.op_id}: favorite_reorder requires favorite_ids")
    try:
        parsed_ids = [UUID(str(x)) for x in raw_ids]
    except (TypeError, ValueError) as exc:
        raise WidgetSyncApplyError(f"{op.op_id}: invalid favorite id") from exc
    if len(parsed_ids) != len(set(parsed_ids)):
        raise WidgetSyncApplyError(f"{op.op_id}: duplicate favorite ids")

    result = await db.execute(select(UserDashboardFavorite).where(UserDashboardFavorite.user_id == user_id))
    rows = {row.id: row for row in result.scalars().all()}
    if set(parsed_ids) != set(rows.keys()):
        raise WidgetSyncApplyError(f"{op.op_id}: favorite_ids must match all user favorites")
    for index, favorite_id in enumerate(parsed_ids):
        rows[favorite_id].sort_order = index  # type: ignore[assignment]
    return WidgetSyncOpResult(op_id=op.op_id, status="applied")
