# ---
# EliteEW · Empery World
# https://eliteew.ru
# Author: po&T <keysray70@gmail.com>
# ---
# Purpose:
# Backend-first EWA companion adapter for the existing EWRP presentation product.
# It does not reimplement generation; it starts an authenticated EWRP job and mirrors progress into companion task-runs.
# Invariants:
# - EWRP remains the source of truth for generation, billing, slide editing and PDF serving.
# - Raw Bearer tokens are never stored in task-run or step payloads; async workers receive opaque token snapshots.
# - After EWRP create via ``ewrp_create_service`` (Postgres + billing), progress mirroring polls main Postgres — not user JWT HTTP.
# - Trust residual V-C2: terminal fail/complete uses ``apply_companion_run_terminal`` (OCC) so user cancel wins.
# Related:
# - api/routers/ewrp.py
# - api/ewa_platform/companion/orchestration/tool_registry.py
# - api/ewa_platform/companion/orchestration/run_lifecycle.py
# - documentation/product/EWRP-REVOLUTIONARY-PRESENTATIONS.md
# - documentation/product/ewa/EWA-ECOSYSTEM-VULNERABILITY-MAP-2026-07-09.md (V-C2)
# ---
"""Companion adapter for EWRP presentation generation."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import socket
import uuid
from collections.abc import Mapping
from typing import Any, Final

import asyncpg
from fastapi import HTTPException

from api.ewa_platform.companion.jobs.task_events import publish_task_event_async
from api.ewa_platform.persistence_pg import companion_asyncpg as companion_pg

logger = logging.getLogger(__name__)

PRESENTATION_GENERATION_INTENT: Final[str] = "presentation_generation_background"
PRESENTATION_STEP_KIND: Final[str] = "presentation_generation_pipeline"
DEFAULT_PRESENTATION_SLIDES: Final[int] = 7
MIN_PRESENTATION_SLIDES: Final[int] = 3
MAX_PRESENTATION_SLIDES: Final[int] = 20

_PRESENTATION_REQUEST_RE = re.compile(
    r"(?is)\b("
    r"презентац\w*|слайд\w*|ewrp|presentation|presentations|slide\s+deck|slides"
    r")\b"
)
_PRESENTATION_VERB_RE = re.compile(
    r"(?is)\b("
    r"созда[йть]*|сдела[йть]*|сгенериру[йть]*|подготовь|подготовить|собери|собрать|"
    r"create|make|generate|build|prepare"
    r")\b"
)
_SLIDE_COUNT_RE = re.compile(r"(?is)\b(?P<n>[0-9]{1,2})\s*(?:слайд\w*|slides?)\b")
_LEADING_CMD_RE = re.compile(
    r"(?is)^\s*(?:"
    r"созда[йть]*|сдела[йть]*|сгенериру[йть]*|подготовь|подготовить|собери|собрать|"
    r"create|make|generate|build|prepare"
    r")\s+(?:мне\s+)?(?:презентац\w*|presentation|slide\s+deck|slides?)\s*(?:на\s+тему|about|on)?\s*[:—-]?\s*"
)


def companion_presentation_generation_enabled() -> bool:
    """Feature gate for companion-triggered EWRP jobs; defaults on because EWRP is already a shipped product."""

    from api.ewa_platform.settings.access import ewa_getenv

    raw = ewa_getenv("EWA_COMPANION_PRESENTATION_GENERATION_ENABLED", "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def user_line_requests_presentation_generation(user_line: str) -> bool:
    """Return True when the line asks the companion to create an EWRP presentation."""

    s = (user_line or "").strip()
    if not s:
        return False
    return _PRESENTATION_REQUEST_RE.search(s) is not None and _PRESENTATION_VERB_RE.search(s) is not None


def extract_presentation_slide_count(user_line: str, args: Mapping[str, Any] | None = None) -> int:
    """Resolve slide count from structured args or free text, clamped to EWRP create bounds."""

    raw_arg = (args or {}).get("num_slides") or (args or {}).get("slides") or (args or {}).get("slide_count")
    value: int | None = None
    try:
        if raw_arg is not None and str(raw_arg).strip():
            value = int(float(str(raw_arg).strip()))
    except TypeError, ValueError:
        value = None
    if value is None:
        match = _SLIDE_COUNT_RE.search(user_line or "")
        if match is not None:
            try:
                value = int(match.group("n"))
            except TypeError, ValueError:
                value = None
    if value is None:
        value = DEFAULT_PRESENTATION_SLIDES
    return max(MIN_PRESENTATION_SLIDES, min(MAX_PRESENTATION_SLIDES, value))


def extract_presentation_topic(user_line: str, args: Mapping[str, Any] | None = None) -> str:
    """Resolve the EWRP topic while keeping browser-side logic thin."""

    for key in ("topic", "presentation_topic", "brief", "prompt"):
        raw = (args or {}).get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()[:2000]
    s = (user_line or "").strip()
    s = _LEADING_CMD_RE.sub("", s).strip()
    s = _SLIDE_COUNT_RE.sub("", s).strip(" .,:;—-")
    return (s or (user_line or "").strip())[:2000]


def resolve_presentation_topic_and_context(
    user_line: str,
    profile: Mapping[str, Any] | None,
    args: Mapping[str, Any] | None = None,
) -> tuple[str, str]:
    """Resolve EWRP topic + optional extra context; deictic «на эту тему» uses last assistant reply."""

    from api.ewa_platform.companion.orchestration.companion_deictic_turn_context import (
        resolve_deictic_turn_context,
    )

    topic = extract_presentation_topic(user_line, args)
    extra = str((args or {}).get("extra_context") or (args or {}).get("context") or "").strip()
    resolved = resolve_deictic_turn_context(user_line, profile, stripped_topic=topic)
    if resolved is not None:
        topic = resolved.topic
        if not extra:
            extra = resolved.extra_context
        elif resolved.extra_context not in extra:
            extra = f"{resolved.extra_context}\n\n{extra}"[:8000]
    return topic[:2000], extra[:8000]


def extract_presentation_title(user_line: str, topic: str, args: Mapping[str, Any] | None = None) -> str:
    """Resolve a short title for the companion operations card and EWRP job."""

    raw = (args or {}).get("title") or (args or {}).get("presentation_title")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()[:500]
    compact = " ".join((topic or user_line or "Презентация").split())
    return compact[:96] or "Презентация"


def extract_presentation_theme(user_line: str, args: Mapping[str, Any] | None = None) -> str:
    """Resolve EWRP visual theme using the shipped EWRP theme ids."""

    raw = (args or {}).get("presentation_theme") or (args or {}).get("theme")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()[:32]
    low = (user_line or "").lower()
    if any(k in low for k in ("тёмн", "темн", "dark", "midnight", "ночн")):
        return "midnight"
    if any(k in low for k in ("премиум", "дорог", "editorial", "редакцион")):
        return "editorial"
    if any(k in low for k in ("бумаг", "paper", "linen")):
        return "linen"
    if any(k in low for k in ("огонь", "ember", "тепл")):
        return "ember"
    return "aurora"


def extract_presentation_web_search_quality(
    args: Mapping[str, Any] | None = None,
) -> str:
    """Resolve web search quality tier for companion-triggered EWRP jobs."""

    from api.services.marketing_web_search_quality import normalize_web_search_quality

    raw = (args or {}).get("web_search_quality") or (args or {}).get("webSearchQuality")
    legacy = (args or {}).get("use_web_search") or (args or {}).get("useWebSearch")
    use_legacy = legacy is True or str(legacy or "").strip().lower() in {"1", "true", "yes", "on"}
    quality = normalize_web_search_quality(
        str(raw).strip() if isinstance(raw, str) else None,
        use_web_search=use_legacy,
    )
    return quality


_SHOW_READY_PRESENTATION_RE = re.compile(
    r"(?ix)"
    r"(?:\b(?:покажи|открой|выведи|показать|открыть|show|open|display|view)\b.{0,60}"
    r"\b(?:презентац\w*|presentation|presentations|slides?|slide\s+deck|pdf|ewrp)\b)"
    r"|(?:\b(?:презентац\w*|presentation|slides?|slide\s+deck)\b.{0,60}\b(?:готов\w*|ready|done)\b"
    r"(?:.{0,40}\b(?:покажи|открой|show|open|view)\b)?)"
)
_EWRP_JOB_ID_IN_LINE_RE = re.compile(r"(?ix)\b(?P<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b")


def user_line_requests_presentation_show(user_line: str) -> bool:
    """Return True when the user asks to open/show an existing EWRP presentation (not create)."""

    s = (user_line or "").strip()
    if not s:
        return False
    if user_line_requests_presentation_generation(s):
        return False
    return _SHOW_READY_PRESENTATION_RE.search(s) is not None


def extract_ewrp_job_id_from_user_line(user_line: str) -> str | None:
    """Extract an explicit EWRP job UUID from free text when present."""

    match = _EWRP_JOB_ID_IN_LINE_RE.search(user_line or "")
    if match is None:
        return None
    return str(match.group("id") or "").strip() or None


async def resolve_presentation_open_target(
    pool: asyncpg.Pool,
    *,
    principal_id: str,
    user_line: str,
) -> dict[str, str] | None:
    """Resolve ``ewrp_job_id`` (+ display fields) for a presentation show/open intent."""

    explicit_job_id = extract_ewrp_job_id_from_user_line(user_line)
    if explicit_job_id:
        from api.services.ewrp_status_service import load_ewrp_status_dict_for_user

        status = await load_ewrp_status_dict_for_user(job_id=explicit_job_id, principal_id=principal_id)
        if status is None:
            return None
        return {
            "ewrp_job_id": explicit_job_id,
            "title": str(status.get("title") or "").strip(),
            "topic": str(status.get("topic") or "").strip(),
        }

    run = await companion_pg.companion_task_find_latest_completed_by_intent(
        pool,
        principal_id=principal_id,
        intent_kind=PRESENTATION_GENERATION_INTENT,
    )
    if run is None:
        return None
    payload = run.get("result_payload")
    data = payload if isinstance(payload, Mapping) else {}
    job_id = str(data.get("ewrp_job_id") or "").strip()
    if not job_id:
        return None
    return {
        "ewrp_job_id": job_id,
        "title": str(data.get("title") or "").strip(),
        "topic": str(data.get("topic") or "").strip(),
    }


def _local_stack0_ewrp_base_url() -> str | None:
    """Container-DNS EWRP base for local stack0 workers in the same Podman network."""

    try:
        socket.getaddrinfo("stack0-eliteew-api-prod", 8000)
    except OSError:
        return None
    return "http://stack0-eliteew-api-prod:8000/api/v1/ewrp"


def presentation_generation_api_base_url(*, for_remote_worker: bool = False) -> str:
    """Base URL for EWRP HTTP calls."""

    if for_remote_worker:
        lan_base = os.environ.get("ELITEEW_LAN_WORKER_HTTP_BASE_URL", "").strip().rstrip("/")
        if lan_base:
            return f"{lan_base}/api/v1/ewrp"
    raw = os.environ.get("EWA_COMPANION_PRESENTATION_HTTP_URL", "").strip().rstrip("/")
    if raw:
        if raw.endswith("/ewrp"):
            return raw
        return f"{raw}/api/v1/ewrp" if not raw.endswith("/api/v1") else f"{raw}/ewrp"
    from api.core.unified_config import unified_settings

    return f"{unified_settings.eliteew_self_http_base_url.rstrip('/')}/api/v1/ewrp"


def resolve_presentation_job_base_url(job_payload: Mapping[str, Any] | None) -> str:
    """Pick worker-safe EWRP base URL; rewrite local loopback to stack0 container DNS when possible."""

    raw = str((job_payload or {}).get("base_url") or "").strip()
    local_stack0_base = _local_stack0_ewrp_base_url()
    if local_stack0_base and raw:
        lan_base = os.environ.get("ELITEEW_LAN_WORKER_HTTP_BASE_URL", "").strip().rstrip("/")
        if "127.0.0.1" in raw or "localhost" in raw.lower() or (lan_base and raw.startswith(lan_base)):
            return local_stack0_base
    if raw and "127.0.0.1" not in raw and "localhost" not in raw.lower():
        return raw.rstrip("/")
    if local_stack0_base:
        return local_stack0_base
    return presentation_generation_api_base_url(for_remote_worker=True)


def presentation_generation_timeout_sec() -> float:
    """Max seconds to mirror EWRP completion into the companion task run."""

    from api.ewa_platform.settings.access import ewa_getenv_float

    try:
        return max(120.0, ewa_getenv_float("EWA_COMPANION_PRESENTATION_TIMEOUT_SEC", default=3600.0))
    except TypeError, ValueError:
        return 3600.0


async def _poll_ewrp_status_from_db(*, ewrp_job_id: str, principal_id: str) -> dict[str, Any] | None:
    """Poll EWRP job row via main Postgres (companion worker mirror; no user JWT on status loop)."""

    from api.services.ewrp_status_service import load_ewrp_status_dict_for_user

    return await load_ewrp_status_dict_for_user(job_id=ewrp_job_id, principal_id=principal_id)


async def _fail_presentation_run(
    pool: asyncpg.Pool,
    *,
    principal_id: str,
    run_id: str,
    step_id: str,
    message: str,
    stage: str,
) -> None:
    from api.ewa_platform.companion.orchestration.run_lifecycle import apply_companion_run_terminal

    payload = {"message": (message or "presentation_generation_failed")[:500], "stage": stage}
    run = await companion_pg.companion_task_run_fetch(pool, run_id=run_id)
    if run is None:
        return
    updated = await apply_companion_run_terminal(
        pool,
        run=run,
        status="failed",
        context="presentation_job_fail",
        error_payload=payload,
    )
    if updated is None:
        return
    await companion_pg.companion_task_step_update(
        pool,
        step_id=step_id,
        status="failed",
        error_payload=payload,
    )
    await publish_task_event_async(
        principal_id=principal_id,
        event_name="task_failed",
        payload={
            "run_id": run_id,
            "status": "failed",
            "intent_kind": PRESENTATION_GENERATION_INTENT,
            "error_payload": payload,
        },
    )
    await publish_task_event_async(
        principal_id=principal_id,
        event_name="task_step",
        payload={
            "run_id": run_id,
            "step_id": step_id,
            "step_index": 1,
            "step_kind": PRESENTATION_STEP_KIND,
            "status": "failed",
            "title": "EWRP presentation generation",
        },
    )


async def run_companion_presentation_generation_job(
    *,
    companion_pool: asyncpg.Pool,
    principal_id: str,
    run_id: str,
    step_id: str,
    catalog_user_id: str = "",
    topic: str,
    title: str,
    num_slides: int,
    extra_context: str = "",
    presentation_theme: str = "aurora",
    default_slide_layout: str = "",
    web_search_quality: str = "off",
    base_url: str = "",
    headers: Mapping[str, str] | None = None,
) -> None:
    """Start EWRP via service layer and mirror its status/result into the companion task run."""

    _ = base_url, headers  # legacy job payloads; create no longer uses HTTP self-call
    user_id = str(catalog_user_id or principal_id or "").strip()
    if not user_id:
        await _fail_presentation_run(
            companion_pool,
            principal_id=principal_id,
            run_id=run_id,
            step_id=step_id,
            message="presentation_generation_missing_catalog_user",
            stage="ewrp_create",
        )
        return

    from api.core.database_manager import get_database_manager
    from api.schemas.ewrp import EwrpCreateRequest
    from api.services.ewrp_create_service import create_ewrp_job_for_user

    create_payload = EwrpCreateRequest(
        topic=topic,
        title=title,
        num_slides=max(
            MIN_PRESENTATION_SLIDES, min(MAX_PRESENTATION_SLIDES, int(num_slides or DEFAULT_PRESENTATION_SLIDES))
        ),
        presentation_theme=presentation_theme or "aurora",
        extra_context=extra_context.strip()[:8000] if extra_context.strip() else None,
        default_slide_layout=default_slide_layout.strip()[:32] if default_slide_layout.strip() else None,
        web_search_quality=web_search_quality or "off",
    )

    ewrp_job_id = ""
    completed_status: dict[str, Any] | None = None
    try:
        manager = await get_database_manager()
        if not manager.postgres_session_factory:
            raise RuntimeError("postgres_session_factory_unavailable")
        async with manager.get_postgres_session() as db:
            created = await create_ewrp_job_for_user(
                db,
                user_id=uuid.UUID(user_id),
                body=create_payload,
                idempotency_key=f"ewa-companion-ewrp-{run_id}",
            )
        ewrp_job_id = str(created.id or "").strip()
        if not ewrp_job_id:
            raise RuntimeError("ewrp_create_missing_job_id")
        await companion_pg.companion_task_step_update(
            companion_pool,
            step_id=step_id,
            status="running",
            output_payload={"ewrp_job_id": ewrp_job_id, "progress": 0, "status": "queued"},
        )
        await publish_task_event_async(
            principal_id=principal_id,
            event_name="task_step",
            payload={
                "run_id": run_id,
                "step_id": step_id,
                "step_index": 1,
                "step_kind": PRESENTATION_STEP_KIND,
                "status": "running",
                "title": title,
                "progress": {"current": 1, "total": 100},
            },
        )

        deadline = asyncio.get_running_loop().time() + presentation_generation_timeout_sec()
        sleep_s = 3.0
        last_progress = -1
        while True:
            polled_status = await _poll_ewrp_status_from_db(
                ewrp_job_id=ewrp_job_id,
                principal_id=principal_id,
            )
            if polled_status is None:
                raise RuntimeError("ewrp_job_not_found")
            ewrp_status = str(polled_status.get("status") or "").strip().lower()
            progress = int(polled_status.get("progress") or 0)
            if progress != last_progress:
                last_progress = progress
                await companion_pg.companion_task_step_update(
                    companion_pool,
                    step_id=step_id,
                    status="running",
                    output_payload={
                        "ewrp_job_id": ewrp_job_id,
                        "status": ewrp_status,
                        "progress": progress,
                    },
                )
            if ewrp_status == "completed":
                completed_status = polled_status
                break
            if ewrp_status == "failed":
                detail = str(polled_status.get("error_message") or "ewrp_generation_failed")
                await _fail_presentation_run(
                    companion_pool,
                    principal_id=principal_id,
                    run_id=run_id,
                    step_id=step_id,
                    message=detail,
                    stage="ewrp_status",
                )
                return
            if asyncio.get_running_loop().time() >= deadline:
                await _fail_presentation_run(
                    companion_pool,
                    principal_id=principal_id,
                    run_id=run_id,
                    step_id=step_id,
                    message="presentation_generation_timeout",
                    stage="ewrp_wait",
                )
                return
            await asyncio.sleep(sleep_s)
            sleep_s = min(15.0, sleep_s * 1.35)
    except (OSError, RuntimeError, ValueError) as exc:
        message = str(exc)[:500] or "presentation_generation_failed"
        logger.exception("[STEP] companion_presentation_generation_failed run_id=%s err=%s", run_id, exc)
        await _fail_presentation_run(
            companion_pool,
            principal_id=principal_id,
            run_id=run_id,
            step_id=step_id,
            message=message,
            stage="ewrp_create" if not ewrp_job_id else "ewrp_mirror",
        )
        return
    except Exception as exc:  # noqa: BLE001 — HTTPException from billing/create service
        if isinstance(exc, HTTPException):
            detail = exc.detail
            if isinstance(detail, dict):
                message = str(detail.get("message") or detail.get("code") or detail)[:500]
            else:
                message = str(detail)[:500] or "presentation_generation_failed"
            stage = "ewrp_create"
        else:
            message = str(exc)[:500] or "presentation_generation_failed"
            stage = "ewrp_mirror"
        logger.exception("[STEP] companion_presentation_generation_failed run_id=%s err=%s", run_id, exc)
        await _fail_presentation_run(
            companion_pool,
            principal_id=principal_id,
            run_id=run_id,
            step_id=step_id,
            message=message,
            stage=stage,
        )
        return

    from api.services.ewrp_status_service import build_companion_presentation_result_payload

    if completed_status is None:
        raise RuntimeError("ewrp_completed_status_missing")
    result_payload = build_companion_presentation_result_payload(
        completed_status,
        ewrp_job_id=ewrp_job_id,
        title=title,
        topic=topic,
        num_slides=num_slides,
        presentation_theme=presentation_theme,
    )
    from api.ewa_platform.companion.orchestration.run_lifecycle import apply_companion_run_terminal

    # V-C2 / E2: OCC before step terminalize so user cancel wins over late worker completion.
    run_row = await companion_pg.companion_task_run_fetch(companion_pool, run_id=run_id)
    if run_row is None:
        return
    updated = await apply_companion_run_terminal(
        companion_pool,
        run=run_row,
        status="completed",
        context="presentation_job_complete",
        result_payload=result_payload,
    )
    if updated is None:
        return
    await companion_pg.companion_task_step_update(
        companion_pool,
        step_id=step_id,
        status="completed",
        output_payload=result_payload,
    )
    await publish_task_event_async(
        principal_id=principal_id,
        event_name="task_completed",
        payload={
            "run_id": run_id,
            "status": "completed",
            "intent_kind": PRESENTATION_GENERATION_INTENT,
            "result_payload": result_payload,
        },
    )
    await publish_task_event_async(
        principal_id=principal_id,
        event_name="task_step",
        payload={
            "run_id": run_id,
            "step_id": step_id,
            "step_index": 1,
            "step_kind": PRESENTATION_STEP_KIND,
            "status": "completed",
            "title": str(result_payload["title"]),
            "progress": {"current": 100, "total": 100},
        },
    )
    from api.ewa_platform.companion.workflows.dag.dag_async_resume import maybe_advance_workflow_from_child_run

    if await maybe_advance_workflow_from_child_run(
        companion_pool,
        child_run_id=run_id,
        result_payload=result_payload,
    ):
        logger.info(
            "[STEP] companion_presentation_job_completed run_id=%s workflow=advanced ewrp_job_id=%s",
            run_id,
            ewrp_job_id,
        )
        return
    logger.info(
        "[STEP] companion_presentation_job_completed run_id=%s ewrp_job_id=%s",
        run_id,
        ewrp_job_id,
    )
