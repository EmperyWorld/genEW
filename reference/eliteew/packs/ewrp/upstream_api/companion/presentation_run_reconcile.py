# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Reconcile EWA companion async presentation task runs with EWRP terminal states and stale worker/HTTP hangs.
# Invariants:
# - Only ``presentation_generation_background`` async runs; never downgrade completed companion runs.
# - EWRP ``completed`` repairs companion ``failed``/``running`` rows (JWT-expiry drift).
# - Stale non-terminal EWRP jobs may be marked failed when past reap horizon.
# Related:
# - api/tasks/companion_presentation_stale_run_reaper.py
# - api/services/ewrp_status_service.py
# ---

from __future__ import annotations

import logging
import uuid
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any, Final

import asyncpg
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from api.ewa_platform.companion.jobs.task_events import publish_task_event_async
from api.ewa_platform.companion.orchestration.companion_presentation_generation import PRESENTATION_STEP_KIND
from api.ewa_platform.companion.orchestration.tool_result_utils import as_mapping_dict
from api.ewa_platform.persistence_pg.companion_asyncpg import (
    companion_task_step_update,
    companion_task_steps_list,
)
from api.ewa_platform.settings.access import ewa_getenv_int
from api.models.ewrp import EwrpJob
from api.services.ewrp_status_service import (
    build_companion_presentation_result_payload,
    ewrp_build_status_response,
    fetch_ewrp_job_for_user,
)

logger = logging.getLogger(__name__)

PRESENTATION_ASYNC_INTENT_KINDS: Final[frozenset[str]] = frozenset({"presentation_generation_background"})
_EWRP_TERMINAL_STATUSES: Final[frozenset[str]] = frozenset({"completed", "failed", "cancelled"})
_COMPANION_REPAIR_STATUSES: Final[frozenset[str]] = frozenset({"pending", "running", "failed"})


def companion_presentation_stale_reap_after_seconds() -> int:
    return max(300, ewa_getenv_int("EWA_COMPANION_PRESENTATION_STALE_REAP_AFTER_SEC", default=1800))


def companion_presentation_reaper_batch_limit() -> int:
    """E8 / V-M7: DB-tunable batch (shared media/universal knob, default 50, max 200)."""

    for key in ("EWA_MEDIA_REAPER_BATCH_LIMIT", "EWA_UNIVERSAL_REAPER_BATCH_LIMIT"):
        raw = ewa_getenv_int(key, default=0)
        if raw > 0:
            return max(1, min(200, raw))
    return 50


def _ewrp_job_id_from_run_steps(steps: list[Mapping[str, Any]]) -> str:
    for step in reversed(steps):
        for payload_key in ("output_payload", "input_payload"):
            payload = step.get(payload_key)
            if not isinstance(payload, Mapping):
                continue
            raw = str(payload.get("ewrp_job_id") or "").strip()
            if raw:
                return raw
    return ""


async def _publish_presentation_terminal_event(
    *,
    principal_id: str,
    run_id: str,
    step_id: str,
    title: str,
    terminal_status: str,
) -> None:
    await publish_task_event_async(
        principal_id=principal_id,
        event_name="task_step",
        payload={
            "run_id": run_id,
            "step_id": step_id,
            "step_index": 1,
            "step_kind": PRESENTATION_STEP_KIND,
            "status": terminal_status,
            "title": title[:240],
            "progress": {"current": 100 if terminal_status == "completed" else 0, "total": 100},
        },
    )


async def _terminalize_companion_presentation_run(
    pool: asyncpg.Pool,
    *,
    run: Mapping[str, Any],
    steps: list[Mapping[str, Any]],
    terminal_status: str,
    message: str,
    stage: str,
    ewrp_job_id: str = "",
    result_payload: Mapping[str, Any] | None = None,
) -> bool:
    run_id = str(run.get("id") or "").strip()
    principal_id = str(run.get("principal_id") or "").strip()
    if not run_id or not principal_id:
        return False
    current = str(run.get("status") or "").strip().lower()
    if current == "completed":
        return False
    if terminal_status != "completed" and current in {"failed", "cancelled"}:
        return False

    error_payload: dict[str, Any] = {
        "message": message[:500],
        "stage": stage[:80],
    }
    if ewrp_job_id:
        error_payload["ewrp_job_id"] = ewrp_job_id

    from api.ewa_platform.companion.orchestration.run_lifecycle import apply_companion_run_terminal

    # Reaper path: force=True; SQL still guards completed/cancelled. OCC run before steps.
    updated = await apply_companion_run_terminal(
        pool,
        run=run,
        status=terminal_status,
        context=f"presentation_reconcile:{stage}",
        result_payload=dict(result_payload or {}) if terminal_status == "completed" else None,
        error_payload=None if terminal_status == "completed" else error_payload,
        force=True,
    )
    if updated is None:
        return False

    plan = as_mapping_dict(run.get("plan_payload"))
    title = str(plan.get("title") or run.get("user_message") or "Презентация")
    step_id = ""
    for step in steps:
        step_id = str(step.get("id") or "").strip()
        if not step_id:
            continue
        if terminal_status == "completed":
            await companion_task_step_update(
                pool,
                step_id=step_id,
                status="completed",
                output_payload=dict(result_payload or {}),
            )
        else:
            await companion_task_step_update(
                pool,
                step_id=step_id,
                status="failed",
                error_payload=error_payload,
            )

    if step_id:
        await _publish_presentation_terminal_event(
            principal_id=principal_id,
            run_id=run_id,
            step_id=step_id,
            title=title,
            terminal_status=terminal_status,
        )
    logger.info(
        "[STEP] companion_presentation_run_reconciled run_id=%s status=%s stage=%s ewrp=%s",
        run_id,
        terminal_status,
        stage,
        ewrp_job_id or "-",
    )
    return True


async def _mark_ewrp_job_failed(
    db: AsyncSession,
    *,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    message: str,
) -> None:
    await db.execute(
        update(EwrpJob)
        .where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
        .values(status="failed", progress=0, error_message=message[:500])
    )
    await db.commit()


def _as_utc_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def reconcile_companion_presentation_run_with_ewrp(
    pool: asyncpg.Pool,
    db: AsyncSession,
    *,
    run: Mapping[str, Any],
    force_stale: bool = False,
) -> bool:
    """Apply EWRP terminal state (or stale timeout) to one companion presentation run."""

    run_id = str(run.get("id") or "").strip()
    principal_id = str(run.get("principal_id") or "").strip()
    if not run_id or not principal_id:
        return False
    if str(run.get("intent_kind") or "").strip() not in PRESENTATION_ASYNC_INTENT_KINDS:
        return False
    companion_status = str(run.get("status") or "").strip().lower()
    if companion_status == "completed":
        return False
    if companion_status not in _COMPANION_REPAIR_STATUSES and not force_stale:
        return False

    steps = await companion_task_steps_list(pool, run_id=run_id)
    ewrp_job_id = _ewrp_job_id_from_run_steps(steps)
    if not ewrp_job_id:
        if force_stale and companion_status in {"pending", "running"}:
            return await _terminalize_companion_presentation_run(
                pool,
                run=run,
                steps=steps,
                terminal_status="failed",
                message="presentation_missing_ewrp_job_id",
                stage="stale-no-ewrp-id",
            )
        return False

    try:
        jid = uuid.UUID(ewrp_job_id)
        uid = uuid.UUID(principal_id)
    except ValueError:
        return False

    job = await fetch_ewrp_job_for_user(db, job_id=jid, user_id=uid)
    if job is None:
        if force_stale:
            return await _terminalize_companion_presentation_run(
                pool,
                run=run,
                steps=steps,
                terminal_status="failed",
                message="presentation_ewrp_job_not_found",
                stage="stale-ewrp-missing",
                ewrp_job_id=ewrp_job_id,
            )
        return False

    ewrp_status = str(job.status or "").strip().lower()
    plan = as_mapping_dict(run.get("plan_payload"))
    title = str(plan.get("title") or run.get("user_message") or job.title or "Презентация")
    topic = str(plan.get("topic_preview") or job.topic or "")
    num_slides = int(plan.get("num_slides") or job.num_slides or 7)
    presentation_theme = str(plan.get("presentation_theme") or job.presentation_theme or "aurora")

    if ewrp_status == "completed":
        status_resp = await ewrp_build_status_response(jid, job)
        result_payload = build_companion_presentation_result_payload(
            status_resp.model_dump(mode="json"),
            ewrp_job_id=ewrp_job_id,
            title=title,
            topic=topic,
            num_slides=num_slides,
            presentation_theme=presentation_theme,
        )
        return await _terminalize_companion_presentation_run(
            pool,
            run=run,
            steps=steps,
            terminal_status="completed",
            message="",
            stage="ewrp-completed",
            ewrp_job_id=ewrp_job_id,
            result_payload=result_payload,
        )

    if ewrp_status == "failed":
        err = str(job.error_message or "ewrp_generation_failed").strip()
        return await _terminalize_companion_presentation_run(
            pool,
            run=run,
            steps=steps,
            terminal_status="failed",
            message=err,
            stage="ewrp-failed",
            ewrp_job_id=ewrp_job_id,
        )

    if not force_stale:
        return False

    stale_sec = companion_presentation_stale_reap_after_seconds()
    now = datetime.now(UTC)
    ewrp_updated = _as_utc_aware(job.updated_at)
    run_updated = _as_utc_aware(run.get("updated_at") if isinstance(run.get("updated_at"), datetime) else None)
    ewrp_stale = ewrp_updated is not None and ewrp_updated < now - timedelta(seconds=stale_sec)
    run_stale = run_updated is not None and run_updated < now - timedelta(seconds=stale_sec)
    if not ewrp_stale and not run_stale:
        return False

    if ewrp_status not in _EWRP_TERMINAL_STATUSES:
        await _mark_ewrp_job_failed(
            db,
            job_id=jid,
            user_id=uid,
            message="ewrp_stale_pipeline_reaped",
        )
    return await _terminalize_companion_presentation_run(
        pool,
        run=run,
        steps=steps,
        terminal_status="failed",
        message="presentation_generation_stale_timeout",
        stage="stale-reap",
        ewrp_job_id=ewrp_job_id,
    )


async def reap_stale_companion_presentation_runs() -> int:
    """Find orphan async presentation runs and reconcile with EWRP or fail on stale timeout."""

    from api.core.database_manager import DatabaseConnectionError, get_database_manager
    from api.ewa_platform.workers.ewa_pool import open_initialized_ewa_worker_pool

    stale_sec = companion_presentation_stale_reap_after_seconds()

    try:
        manager = await get_database_manager()
    except DatabaseConnectionError:
        logger.warning("[COMPANION_PRESENTATION_STALE_REAPER] database manager unavailable")
        return 0

    if not manager.postgres_session_factory:
        logger.warning("[COMPANION_PRESENTATION_STALE_REAPER] postgres session factory missing")
        return 0

    try:
        pool = await open_initialized_ewa_worker_pool(min_size=1, max_size=4)
    except RuntimeError:
        logger.warning("[COMPANION_PRESENTATION_STALE_REAPER] EWA_DATABASE_URL unset")
        return 0

    # Process-level pool (E4): do not close after each sweep.
    reconciled = 0
    batch_limit = companion_presentation_reaper_batch_limit()
    async with pool.acquire() as conn:
        active_rows = await conn.fetch(
            """
            SELECT *
            FROM ewa_companion_task_runs
            WHERE execution_mode = 'async'
              AND intent_kind = ANY($1::text[])
              AND status IN ('pending', 'running')
              AND updated_at < NOW() - ($2::int * INTERVAL '1 second')
            ORDER BY updated_at ASC
            LIMIT $3
            """,
            list(PRESENTATION_ASYNC_INTENT_KINDS),
            stale_sec,
            batch_limit,
        )
        repair_rows = await conn.fetch(
            """
            SELECT *
            FROM ewa_companion_task_runs
            WHERE execution_mode = 'async'
              AND intent_kind = ANY($1::text[])
              AND status = 'failed'
            ORDER BY updated_at DESC
            LIMIT $2
            """,
            list(PRESENTATION_ASYNC_INTENT_KINDS),
            batch_limit,
        )
    rows = [dict(r) for r in active_rows] + [dict(r) for r in repair_rows]

    async with manager.get_postgres_session() as db:
        for row in rows:
            run = dict(row)
            force_stale = str(run.get("status") or "").strip().lower() in {"pending", "running"}
            changed = await reconcile_companion_presentation_run_with_ewrp(
                pool,
                db,
                run=run,
                force_stale=force_stale,
            )
            if changed:
                reconciled += 1

    if reconciled:
        logger.warning(
            "[COMPANION_PRESENTATION_STALE_REAPER] reconciled=%s stale_sec=%s",
            reconciled,
            stale_sec,
        )
    return reconciled


__all__ = (
    "PRESENTATION_ASYNC_INTENT_KINDS",
    "companion_presentation_reaper_batch_limit",
    "companion_presentation_stale_reap_after_seconds",
    "reap_stale_companion_presentation_runs",
    "reconcile_companion_presentation_run_with_ewrp",
)
