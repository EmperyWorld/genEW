# ---
# EliteEW · Empery World
# https://eliteew.ru
# Author: po&T <keysray70@gmail.com>
# ---
# Purpose:
# Authenticated HTTP entry for **EWA companion chat** — one user message → HTTP LLM reply; merges transcript into profile.
# Provides both a synchronous JSON endpoint and a Server-Sent Events stream for real-time presence.
# Also exposes the **proactive observation tick** (HCM Module B / project "Mela's Ascension"): the SPA POSTs a
# debounced observation diff and gets back a cheap anticipation hint without triggering an LLM turn.
# Invariants:
# - Requires ``app.state.ewa_orchestration_pool`` + initialized companion row (**404** when missing profile).
# - Resolves **content catalogue user id** via ``get_current_user_db_id`` (same as Content Manager) so DocEditor opens can
#   be grounded on ``unified_content`` in the **main** Postgres (``DATABASE_URL``); Server-first v2 uses that same DB for
#   storage I/O while companion profile/task state stay on ``EWA_DATABASE_URL`` when configured.
# - ``seed_persona_id`` may switch to ``arlika`` once (trust 10 + abuse classifier) — see ``companion_trust_turn``.
# - Stream emits keep-alive comments ~every 2s so reverse proxies do not drop the connection (POST-API rule).
# - ``POST /companion-observation`` MUST NOT call the HTTP LLM. It writes an ``ewa_companion_episodes`` row and
#   returns a templated hint based on existing memory recall. Per-principal **token-budget** limiting + weak-payload logs
#   protect PG from buggy clients without breaking the SPA contract (429-free soft ``accepted=False`` on limit exceed).
# Related:
# - api/ewa_platform/gateways/ewa_service_unavailable.py
# - api/ewa_platform/companion/turn/chat_turn.py
# - api/ewa_platform/companion/turn/sse_terminal_contract.py
# - api/ewa_platform/companion/operations/result_payload_content_guard.py (A-09)
# - api/ewa_platform/companion/persona/anticipation.py
# - api/ewa_platform/companion/ux/observation_rate_limit.py
# - .cursor/rules/POST-API.mdc
# - documentation/product/ewa/EWA-COMPANION-PROACTIVE-OBSERVER.md
# ---
"""EWA companion chat router."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Mapping
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status  # type: ignore[import-untyped]
from fastapi.responses import StreamingResponse  # type: ignore[import-untyped]
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.auth import User
from api.core.database_manager import get_postgres_session
from api.core.oauth2_auth import require_oauth2_user
from api.dependencies.user_context import get_current_user_db_id
from api.ewa_platform.companion.jobs.task_events import (
    format_run_snapshot_sse_event,
    format_task_sse_event,
    iter_task_events_sse,
)
from api.ewa_platform.companion.operations.result_payload_content_guard import (
    sanitize_task_run_content_references,
    sanitize_task_runs_content_references,
)
from api.ewa_platform.companion.orchestration.run_lifecycle import is_run_terminal
from api.ewa_platform.companion.orchestration.task_run_list_summary import (
    trim_task_run_for_list_summary,
)
from api.ewa_platform.companion.persona.anticipation import build_anticipation_hint
from api.ewa_platform.companion.surface_blocks import attach_surface_blocks_to_run
from api.ewa_platform.companion.turn.chat_turn import execute_companion_chat_message, iter_companion_chat_stream
from api.ewa_platform.companion.turn.companion_ocr_turn import execute_companion_ocr_persist_turn
from api.ewa_platform.companion.turn.sse_terminal_contract import (
    terminal_error_sse,
    wrap_companion_chat_sse_terminal,
)
from api.ewa_platform.companion.ux.observation_rate_limit import companion_observation_rate_limit_allow
from api.ewa_platform.desktop.runtime import extract_bearer_token
from api.ewa_platform.gateways.ewa_service_unavailable import (
    companion_chat_llm_disabled_exception,
    ewa_pool_unavailable_exception,
)
from api.ewa_platform.persistence_pg import companion_asyncpg as companion_pg
from api.ewa_platform.schemas.pydantic.companion_chat import (
    CompanionChatMessageIn,
    CompanionChatMessageOut,
    CompanionOcrTurnIn,
    CompanionTaskRunCancelOut,
    CompanionTaskRunConfirmIn,
    CompanionTaskRunConfirmOut,
    CompanionTaskRunOut,
    CompanionTaskRunsOut,
)
from api.ewa_platform.schemas.pydantic.companion_observation import (
    CompanionHintOut,
    CompanionObservationIn,
    CompanionObservationOut,
    CompanionPresenceObservationOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["EWA - Companion chat"])

_STREAM_KEEPALIVE_SEC = 2.0


def _pool(request: Request) -> Any | None:
    return getattr(request.app.state, "ewa_orchestration_pool", None)


def _principal(user: User) -> str:
    return str(user.id)


async def _content_catalog_pool() -> Any | None:
    try:
        from api.core.database_manager import get_asyncpg_pool

        return await get_asyncpg_pool()
    except Exception as exc:  # noqa: BLE001 — guard is best-effort when catalogue DB unavailable.
        logger.debug("[STEP] companion_content_guard_pool_skip err=%s", exc)
        return None


async def _prepare_task_run_response(
    pool: Any,
    run: dict[str, Any],
    *,
    include_steps: bool,
    content_pool: Any | None,
) -> dict[str, Any]:
    run = await _attach_task_run_steps(pool, run, include_steps=include_steps)
    run = await sanitize_task_run_content_references(run, content_pool=content_pool)
    return attach_surface_blocks_to_run(run)


async def _prepare_task_runs_response(
    pool: Any,
    runs: list[dict[str, Any]],
    *,
    include_steps: bool,
    content_pool: Any | None,
    list_profile: Literal["full", "summary"] = "full",
) -> list[dict[str, Any]]:
    if include_steps:
        enriched: list[dict[str, Any]] = []
        for run in runs:
            enriched.append(await _attach_task_run_steps(pool, run, include_steps=True))
        runs = enriched
    runs = await sanitize_task_runs_content_references(runs, content_pool=content_pool)
    if list_profile == "summary":
        return [trim_task_run_for_list_summary(run) for run in runs]
    return [attach_surface_blocks_to_run(run) for run in runs]


def _companion_observation_truthy_observation(observation: Mapping[str, Any]) -> bool:
    """Return True when the opaque observation dict carries any non-empty scalar / non-empty container."""

    for _k, raw in observation.items():
        if raw is None:
            continue
        if isinstance(raw, bool):
            return True
        if isinstance(raw, str):
            if raw.strip():
                return True
            continue
        if isinstance(raw, int | float) and raw != 0:
            return True
        if isinstance(raw, Mapping) and raw:
            return True
        if isinstance(raw, list | tuple | set | frozenset) and raw:
            return True
    return False


def _companion_observation_weak_payload(trigger: str, observation: Mapping[str, Any], shell_present: bool) -> bool:
    """Heuristic noop tick: meaningful triggers but no identifiers and no shell snapshot to ground recall."""

    t = str(trigger or "").strip().lower()
    if t in {"idle", "manual_tick"}:
        return False
    if shell_present:
        return False
    return not _companion_observation_truthy_observation(observation)


@router.post(
    "/companion-chat/message",
    response_model=CompanionChatMessageOut,
    operation_id="ewa_companion_chat_message",
    summary="Companion chat: one user message → LLM reply (persists transcript)",
)
async def post_companion_chat_message(
    request: Request,
    body: CompanionChatMessageIn,
    auth_user: User = Depends(require_oauth2_user),  # noqa: B008
    content_catalog_user_id: str = Depends(get_current_user_db_id),  # noqa: B008
    db: AsyncSession = Depends(get_postgres_session),  # noqa: B008
) -> dict[str, Any]:
    """Run HTTP LLM completion with stored persona + chat history."""

    pool = _pool(request)
    if pool is None:
        raise ewa_pool_unavailable_exception()

    pid = _principal(auth_user)
    shell_payload = body.shell_context.model_dump(exclude_none=True) if body.shell_context is not None else None
    image_payload = body.image_attachment.model_dump() if body.image_attachment is not None else None
    try:
        return await execute_companion_chat_message(
            pool,
            principal_id=pid,
            auth_user=auth_user,
            bearer_token=extract_bearer_token(request),
            message=body.message,
            shell_context=shell_payload,
            content_catalog_user_id=content_catalog_user_id,
            oauth2_sub_for_content_alternate=str(auth_user.id),
            client_turn_id=body.client_turn_id,
            image_attachment=image_payload,
            use_web_search=body.use_web_search,
            web_search_db=db,
        )
    except ValueError as e:
        if str(e) == "companion_profile_not_initialized":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="companion_profile_not_initialized",
            ) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except RuntimeError as e:
        code = str(e)
        if code == "companion_chat_llm_disabled":
            raise companion_chat_llm_disabled_exception() from e
        logger_hint = f"companion_chat_failed: {code}"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=logger_hint) from e


@router.post(
    "/companion-chat/ocr-turn",
    response_model=CompanionChatMessageOut,
    operation_id="ewa_companion_chat_ocr_turn",
    summary="Companion chat: persist OCR instrument turn (no LLM)",
)
async def post_companion_chat_ocr_turn(
    request: Request,
    body: CompanionOcrTurnIn,
    auth_user: User = Depends(require_oauth2_user),  # noqa: B008
) -> dict[str, Any]:
    """Append user+assistant transcript after client-side image OCR."""

    pool = _pool(request)
    if pool is None:
        raise ewa_pool_unavailable_exception()

    pid = _principal(auth_user)
    try:
        return await execute_companion_ocr_persist_turn(
            pool,
            principal_id=pid,
            filename=body.filename,
            ocr_text=body.ocr_text,
            confidence=body.confidence,
            source=body.source,
            unified_content_id=body.unified_content_id,
            client_turn_id=body.client_turn_id,
        )
    except ValueError as e:
        if str(e) == "companion_profile_not_initialized":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="companion_profile_not_initialized",
            ) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"companion_ocr_turn_failed: {e!s}",
        ) from e


@router.get(
    "/companion-chat/task-runs",
    response_model=CompanionTaskRunsOut,
    operation_id="ewa_companion_chat_task_runs_list",
    summary="Companion chat operations: list recent task runs",
)
async def list_companion_chat_task_runs(
    request: Request,
    limit: int = Query(default=10, ge=1, le=100),
    include_steps: bool = Query(default=False),
    list_profile: Literal["full", "summary"] = Query(
        default="summary",
        description="summary: trim heavy plan/result blobs for Operations list polling",
    ),
    auth_user: User = Depends(require_oauth2_user),  # noqa: B008
) -> CompanionTaskRunsOut:
    """Return latest durable companion task-runs for the current principal (active first)."""

    pool = _pool(request)
    if pool is None:
        raise ewa_pool_unavailable_exception()
    pid = _principal(auth_user)
    if include_steps:
        from api.ewa_platform.companion.workflows.user.declarative_advance import (
            reconcile_stalled_declarative_workflows_for_principal,
        )

        await reconcile_stalled_declarative_workflows_for_principal(pool, principal_id=pid)
    runs = await companion_pg.companion_task_runs_list(
        pool,
        principal_id=pid,
        limit=limit,
        top_level_only=True,
    )
    content_pool = await _content_catalog_pool()
    runs = await _prepare_task_runs_response(
        pool,
        runs,
        include_steps=include_steps,
        content_pool=content_pool,
        list_profile=list_profile,
    )
    return CompanionTaskRunsOut(runs=runs)


@router.get(
    "/companion-chat/task-events/stream",
    operation_id="ewa_companion_chat_task_events_stream",
    summary="Companion task lifecycle SSE (background jobs, Redis bridge)",
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def stream_companion_chat_task_events(
    request: Request,
    auth_user: User = Depends(require_oauth2_user),  # noqa: B008
) -> StreamingResponse:
    """Subscribe to task_accepted/task_step/task_completed/task_failed without an open chat stream."""

    pid = _principal(auth_user)
    keepalive_interval_sec = 2.0

    async def event_gen() -> AsyncIterator[str]:
        stop_redis = asyncio.Event()
        queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def pump_redis() -> None:
            try:
                async for piece in iter_task_events_sse(principal_id=pid, stop_event=stop_redis):
                    await queue.put(piece)
            finally:
                await queue.put(None)

        redis_task = asyncio.create_task(pump_redis())
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    piece = await asyncio.wait_for(queue.get(), timeout=keepalive_interval_sec)
                except TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                if piece is None:
                    break
                yield piece
        finally:
            stop_redis.set()
            if not redis_task.done():
                redis_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await redis_task

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/companion-chat/task-runs/{run_id}",
    response_model=CompanionTaskRunOut,
    operation_id="ewa_companion_chat_task_run_get",
    summary="Companion chat operations: fetch one task run",
)
async def get_companion_chat_task_run(
    request: Request,
    run_id: str,
    include_steps: bool = Query(default=True),
    auth_user: User = Depends(require_oauth2_user),  # noqa: B008
) -> CompanionTaskRunOut:
    """Return one task run scoped to the current principal."""

    pool = _pool(request)
    if pool is None:
        raise ewa_pool_unavailable_exception()
    pid = _principal(auth_user)
    run = await companion_pg.companion_task_run_fetch_for_principal(pool, run_id=run_id, principal_id=pid)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="companion_task_run_not_found")
    content_pool = await _content_catalog_pool()
    run = await _prepare_task_run_response(
        pool,
        run,
        include_steps=include_steps,
        content_pool=content_pool,
    )
    return CompanionTaskRunOut.model_validate(run)


@router.get(
    "/companion-chat/task-runs/{run_id}/events",
    operation_id="ewa_companion_chat_task_run_events_stream",
    summary="Companion task lifecycle SSE for one run (reconnect when chat stream closed)",
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def stream_companion_chat_task_run_events(
    request: Request,
    run_id: str,
    auth_user: User = Depends(require_oauth2_user),  # noqa: B008
) -> StreamingResponse:
    """Subscribe to Redis task events filtered to ``run_id``; emits ``run_snapshot`` on connect."""

    pool = _pool(request)
    if pool is None:
        raise ewa_pool_unavailable_exception()
    pid = _principal(auth_user)
    run = await companion_pg.companion_task_run_fetch_for_principal(pool, run_id=run_id, principal_id=pid)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="companion_task_run_not_found")
    content_pool = await _content_catalog_pool()
    run = await _prepare_task_run_response(
        pool,
        run,
        include_steps=True,
        content_pool=content_pool,
    )
    keepalive_interval_sec = 2.0
    terminal_on_connect = is_run_terminal(str(run.get("status") or ""))

    async def event_gen() -> AsyncIterator[str]:
        yield format_run_snapshot_sse_event(run)
        if terminal_on_connect:
            yield format_task_sse_event("done", {"ok": True})
            return

        stop_redis = asyncio.Event()
        queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def pump_redis() -> None:
            try:
                async for piece in iter_task_events_sse(
                    principal_id=pid,
                    stop_event=stop_redis,
                    run_id_filter=run_id,
                ):
                    await queue.put(piece)
            finally:
                await queue.put(None)

        redis_task = asyncio.create_task(pump_redis())
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    piece = await asyncio.wait_for(queue.get(), timeout=keepalive_interval_sec)
                except TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                if piece is None:
                    break
                yield piece
                event_name = ""
                for line in piece.split("\n"):
                    if line.startswith("event:"):
                        event_name = line[6:].strip()
                        break
                if event_name in ("task_completed", "task_failed"):
                    yield format_task_sse_event("done", {"ok": True})
                    break
        finally:
            stop_redis.set()
            if not redis_task.done():
                redis_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await redis_task

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/companion-chat/task-runs/{run_id}/confirm",
    response_model=CompanionTaskRunConfirmOut,
    operation_id="ewa_companion_chat_task_run_confirm",
    summary="Companion chat operations: confirm or cancel awaiting task run",
)
async def confirm_companion_chat_task_run(
    request: Request,
    run_id: str,
    body: CompanionTaskRunConfirmIn,
    auth_user: User = Depends(require_oauth2_user),  # noqa: B008
) -> CompanionTaskRunConfirmOut:
    """Apply explicit confirm/cancel without typing affirmation in chat."""

    pool = _pool(request)
    if pool is None:
        raise ewa_pool_unavailable_exception()
    pid = _principal(auth_user)
    run = await companion_pg.companion_task_run_fetch_for_principal(pool, run_id=run_id, principal_id=pid)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="companion_task_run_not_found")
    if str(run.get("intent_kind") or "").strip() == "agentic_session":
        from api.ewa_platform.agentic.respond import apply_agentic_task_run_confirm

        outcome = await apply_agentic_task_run_confirm(
            pool,
            run=run,
            principal_id=pid,
            decision=body.decision,  # type: ignore[arg-type]
            expect_run_revision=body.expect_run_revision,
        )
        if body.expect_run_revision is not None and outcome.get("revision_conflict"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="companion_task_run_revision_conflict",
            )
        if not outcome.get("ok"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(outcome.get("reason") or "agentic_confirm_failed"),
            )
        task_run_raw = outcome.get("task_run")
        if not isinstance(task_run_raw, Mapping):
            task_run_raw = run
        content_pool = await _content_catalog_pool()
        task_run = CompanionTaskRunOut.model_validate(
            await _prepare_task_run_response(
                pool,
                dict(task_run_raw),
                include_steps=False,
                content_pool=content_pool,
            )
        )
        return CompanionTaskRunConfirmOut(
            ok=True,
            reply=str(outcome.get("reply") or ""),
            actions=[],
            task_run=task_run,
        )
    if str(run.get("status") or "").strip() != "awaiting_confirmation":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="companion_task_run_not_awaiting_confirmation",
        )
    from api.ewa_platform.companion.orchestration.task_run_confirm import apply_companion_task_run_confirmation

    outcome = await apply_companion_task_run_confirmation(
        pool,
        run=run,
        principal_id=pid,
        decision=body.decision,  # type: ignore[arg-type]
        expect_run_revision=body.expect_run_revision,
    )
    if body.expect_run_revision is not None and outcome.get("revision_conflict"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="companion_task_run_revision_conflict",
        )
    task_run_raw = outcome.get("task_run")
    if not isinstance(task_run_raw, Mapping):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="companion_task_confirm_failed")
    content_pool = await _content_catalog_pool()
    task_run = CompanionTaskRunOut.model_validate(
        await _prepare_task_run_response(
            pool,
            dict(task_run_raw),
            include_steps=False,
            content_pool=content_pool,
        )
    )
    actions_raw = outcome.get("actions")
    actions = [dict(a) for a in actions_raw if isinstance(a, Mapping)] if isinstance(actions_raw, list) else []
    return CompanionTaskRunConfirmOut(
        ok=True,
        reply=str(outcome.get("reply") or ""),
        actions=actions,
        task_run=task_run,
    )


@router.post(
    "/companion-chat/task-runs/{run_id}/cancel",
    response_model=CompanionTaskRunCancelOut,
    operation_id="ewa_companion_chat_task_run_cancel",
    summary="Cancel in-flight async music companion task run",
)
async def cancel_companion_chat_task_run(
    request: Request,
    run_id: str,
    auth_user: User = Depends(require_oauth2_user),  # noqa: B008
) -> CompanionTaskRunCancelOut:
    """Cancel stuck/running music generation in companion (+ linked UGS requests when correlated)."""

    pool = _pool(request)
    if pool is None:
        raise ewa_pool_unavailable_exception()
    pid = _principal(auth_user)
    run = await companion_pg.companion_task_run_fetch_for_principal(pool, run_id=run_id, principal_id=pid)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="companion_task_run_not_found")

    from api.core.database_manager import DatabaseConnectionError, get_database_manager
    from api.ewa_platform.companion.orchestration.task_run_cancel import (
        cancel_companion_task_run_for_user,
        is_companion_task_run_cancellable,
    )

    if not is_companion_task_run_cancellable(run):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="companion_task_run_not_cancellable",
        )

    try:
        manager = await get_database_manager()
    except DatabaseConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database_unavailable",
        ) from exc

    async with manager.get_postgres_session() as db:
        outcome = await cancel_companion_task_run_for_user(
            pool,
            db,
            run=run,
            oauth_user_id=str(auth_user.id),
        )

    refreshed = await companion_pg.companion_task_run_fetch_for_principal(
        pool,
        run_id=run_id,
        principal_id=pid,
    )
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="companion_task_cancel_failed")
    content_pool = await _content_catalog_pool()
    refreshed = await _prepare_task_run_response(
        pool,
        refreshed,
        include_steps=True,
        content_pool=content_pool,
    )
    ru = str(getattr(auth_user, "locale", "") or "").lower().startswith("ru")
    status_now = str(refreshed.get("status") or "").strip().lower()
    if status_now == "cancelled":
        reply = "Отменила операцию." if ru else "Cancelled the operation."
    elif status_now in {"completed", "failed"}:
        reply = "Задача уже завершилась — статус обновлён." if ru else "The task already finished — status refreshed."
    else:
        reply = "Не удалось отменить задачу." if ru else "Could not cancel the task."

    return CompanionTaskRunCancelOut(
        ok=bool(outcome.get("ok")),
        reply=reply,
        task_run=CompanionTaskRunOut.model_validate(refreshed),
        ugs_requests_cancelled=int(outcome.get("ugs_requests_cancelled") or 0),
    )


async def _attach_task_run_steps(
    pool: Any,
    run: dict[str, Any],
    *,
    include_steps: bool,
) -> dict[str, Any]:
    if not include_steps:
        return run
    out = dict(run)
    out["steps"] = await companion_pg.companion_task_steps_list(pool, run_id=str(run.get("id") or ""))
    return out


async def _merge_stream_with_task_events_and_keepalive(
    inner: AsyncIterator[str],
    *,
    principal_id: str,
    keepalive_interval_sec: float,
) -> AsyncIterator[str]:
    """Forward chat SSE while merging Redis task lifecycle events and keep-alive comments."""

    queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
    stop_redis = asyncio.Event()

    async def pump_inner() -> None:
        try:
            async for piece in inner:
                await queue.put(("data", piece))
        except Exception as exc:  # noqa: BLE001 — surface stream errors as one event then end.
            await queue.put(("error", exc))
        finally:
            stop_redis.set()
            await queue.put(("inner_done", None))

    async def pump_redis() -> None:
        try:
            async for piece in iter_task_events_sse(principal_id=principal_id, stop_event=stop_redis):
                await queue.put(("data", piece))
        except Exception as exc:  # noqa: BLE001 — Redis bridge is best-effort.
            logger.warning(
                "[STEP] companion_sse_redis_bridge_failed principal=%s err=%s",
                principal_id,
                exc,
                exc_info=True,
            )
        finally:
            await queue.put(("redis_done", None))

    inner_task = asyncio.create_task(pump_inner())
    redis_task = asyncio.create_task(pump_redis())
    inner_done = False
    try:
        while True:
            if inner_done and queue.empty():
                break
            try:
                kind, value = await asyncio.wait_for(queue.get(), timeout=keepalive_interval_sec)
            except TimeoutError:
                yield ": keep-alive\n\n"
                continue
            if kind == "data":
                yield str(value)
            elif kind == "error":
                yield terminal_error_sse(
                    code="companion_chat_stream_failure",
                    message=str(value)[:500],
                )
                inner_done = True
                stop_redis.set()
            elif kind == "inner_done":
                inner_done = True
                stop_redis.set()
                while not queue.empty():
                    k2, v2 = queue.get_nowait()
                    if k2 == "data":
                        yield str(v2)
                break
    finally:
        stop_redis.set()
        for task in (inner_task, redis_task):
            if not task.done():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task


@router.post(
    "/companion-chat/stream",
    operation_id="ewa_companion_chat_stream",
    summary="Companion chat (streaming): one user message → SSE delta + final reply",
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def post_companion_chat_stream(
    request: Request,
    body: CompanionChatMessageIn,
    auth_user: User = Depends(require_oauth2_user),  # noqa: B008
    content_catalog_user_id: str = Depends(get_current_user_db_id),  # noqa: B008
    db: AsyncSession = Depends(get_postgres_session),  # noqa: B008
) -> StreamingResponse:
    """Server-Sent Events stream of ``delta``/``final``/``done`` events for live typing."""

    pool = _pool(request)
    if pool is None:
        raise ewa_pool_unavailable_exception()

    pid = _principal(auth_user)
    shell_payload = body.shell_context.model_dump(exclude_none=True) if body.shell_context is not None else None
    image_payload = body.image_attachment.model_dump() if body.image_attachment is not None else None
    inner = iter_companion_chat_stream(
        pool,
        principal_id=pid,
        auth_user=auth_user,
        bearer_token=extract_bearer_token(request),
        message=body.message,
        shell_context=shell_payload,
        content_catalog_user_id=content_catalog_user_id,
        oauth2_sub_for_content_alternate=str(auth_user.id),
        client_turn_id=body.client_turn_id,
        image_attachment=image_payload,
        use_web_search=body.use_web_search,
        web_search_db=db,
    )
    merged = _merge_stream_with_task_events_and_keepalive(
        inner,
        principal_id=pid,
        keepalive_interval_sec=_STREAM_KEEPALIVE_SEC,
    )
    wrapped = wrap_companion_chat_sse_terminal(merged, request=request, log_context="companion_chat_stream")
    headers = {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(wrapped, media_type="text/event-stream", headers=headers)


@router.post(
    "/companion-observation",
    response_model=CompanionObservationOut,
    operation_id="ewa_companion_observation_tick",
    summary="Proactive observation tick: file open / focus / workspace switch → anticipation hint",
)
async def post_companion_observation(
    request: Request,
    body: CompanionObservationIn,
    auth_user: User = Depends(require_oauth2_user),  # noqa: B008
) -> CompanionObservationOut:
    """Light-weight tick: persist an observation row, return an anticipation hint without HTTP LLM.

    This endpoint deliberately **never** triggers a chat turn. It returns a small ``CompanionHintOut``
    the SPA can render as a pre-message bubble. See HCM Module B (project "Mela's Ascension" PR-3).
    """

    pool = _pool(request)
    if pool is None:
        raise ewa_pool_unavailable_exception()

    pid = _principal(auth_user)
    allowed_obs, retry_after = companion_observation_rate_limit_allow(pid)
    if not allowed_obs:
        logger.warning(
            "[STEP] companion_observation_rate_limited principal=%s retry_after=%s",
            pid,
            retry_after,
        )
        return CompanionObservationOut(ok=True, accepted=False, hint=None, episode_recorded=False)

    profile = await companion_pg.companion_profile_fetch(pool, principal_id=pid)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="companion_profile_not_initialized")

    shell_payload = body.shell_context.model_dump(exclude_none=True) if body.shell_context is not None else None
    if _companion_observation_weak_payload(body.trigger, body.observation, shell_payload is not None):
        logger.info(
            "[STEP] companion_observation_weak_payload principal=%s trigger=%s",
            pid,
            body.trigger,
        )
    from api.ewa_platform.companion.ux.presence_mode import (
        get_presence_mode,
        is_contemplation_active,
    )

    contemplation = is_contemplation_active(profile if isinstance(profile, Mapping) else None)
    presence_mode = get_presence_mode(profile if isinstance(profile, Mapping) else None)

    continuity_applied = False
    from api.ewa_platform.companion.persona.continuity import (
        CONTINUITY_NS,
        apply_continuity_decay,
        companion_continuity_v1_enabled,
        get_continuity,
        normalize_continuity_block,
    )

    if companion_continuity_v1_enabled() and isinstance(profile, Mapping):
        before = normalize_continuity_block(get_continuity(profile))
        after = apply_continuity_decay(before)
        if after != before:
            continuity_applied = True
            try:
                await companion_pg.companion_profile_patch(
                    pool,
                    principal_id=pid,
                    learned_preferences={CONTINUITY_NS: after},
                )
                # Keep in-memory profile coherent for soft-initiative / anticipation.
                lp = dict(profile.get("learned_preferences") or {})
                lp[CONTINUITY_NS] = after
                profile = {**profile, "learned_preferences": lp}
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "[STEP] companion_observation_continuity_persist_failed principal=%s err=%s",
                    pid,
                    exc,
                )
                continuity_applied = False
        else:
            # Decay ran with no material change — still mark applied when block exists & non-default.
            continuity_applied = (
                str(before.get("mood_tint") or "neutral") != "neutral"
                or abs(float(before.get("valence") or 0.0)) >= 0.05
            )

    hint_dict, episode_recorded = await build_anticipation_hint(
        pool,
        principal_id=pid,
        profile=profile,
        trigger=body.trigger,
        observation=body.observation,
        shell_context_payload=shell_payload,
    )

    suppress_reason: str | None = None
    if contemplation:
        # Contemplation wins over anticipation / soft initiative / proactive (roadmap dual-flag).
        hint_dict = None
        suppress_reason = "contemplation"
        logger.info(
            "[STEP] companion_observation_hint_suppressed reason=contemplation principal=%s",
            pid,
        )
    elif hint_dict is not None:
        from api.ewa_platform.companion.proactive.soft_initiative import (
            SOFT_INITIATIVE_NS,
            apply_soft_initiative_to_hint,
            companion_soft_initiative_enabled,
        )

        if companion_soft_initiative_enabled():
            obs = body.observation if isinstance(body.observation, Mapping) else {}
            soft_hint, soft_blob = apply_soft_initiative_to_hint(
                profile if isinstance(profile, Mapping) else {},
                hint_dict,
                title=str(obs.get("title") or "").strip() or None,
                app=str(obs.get("app_component") or "").strip() or None,
            )
            if soft_hint is None:
                hint_dict = None
                suppress_reason = "soft_initiative_budget"
                logger.info(
                    "[STEP] companion_observation_hint_suppressed reason=soft_initiative_budget principal=%s",
                    pid,
                )
            else:
                hint_dict = soft_hint
                if soft_blob is not None:
                    try:
                        await companion_pg.companion_profile_patch(
                            pool,
                            principal_id=pid,
                            learned_preferences={SOFT_INITIATIVE_NS: soft_blob},
                        )
                    except Exception as exc:  # noqa: BLE001
                        logger.warning(
                            "[STEP] companion_soft_initiative_budget_persist_failed principal=%s err=%s",
                            pid,
                            exc,
                        )

    hint = CompanionHintOut.model_validate(hint_dict) if hint_dict is not None else None

    from api.ewa_platform.companion.proactive.review_engine import build_proactive_suggestion
    from api.ewa_platform.companion.protocol.config import companion_proactive_review_enabled

    if companion_proactive_review_enabled() and not contemplation:
        proactive = build_proactive_suggestion(
            profile=profile if isinstance(profile, Mapping) else {"learned_preferences": {}},
            shell_context=shell_payload,
            trigger="observation",
        )
        if proactive is not None:
            priority_kinds = {"risk", "gap", "run_complete_followup"}
            if hint is None or proactive.kind in priority_kinds:
                hint = CompanionHintOut(
                    kind="proactive_review",
                    hint_text=(proactive.question_ru or proactive.question_en).strip(),
                    related_episodes=[],
                    suggested_action={
                        "kind": "proactive_review",
                        "quick_replies": proactive.quick_replies,
                        "suggestion": proactive.model_dump(mode="json"),
                    },
                )

    return CompanionObservationOut(
        ok=True,
        accepted=True,
        hint=hint,
        episode_recorded=episode_recorded,
        presence=CompanionPresenceObservationOut(
            mode=presence_mode,
            continuity_applied=continuity_applied,
            hint_suppressed_reason=suppress_reason,
        ),
    )
