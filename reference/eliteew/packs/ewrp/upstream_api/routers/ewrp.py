# ---
# EliteEW · Empery World
# https://eliteew.ru
# Author: po&T && TZBrand
# ---
# Purpose:
# EWRP — EliteEW Revolutionary Presentations: create, track, edit, and serve generated presentation PDFs.
# Invariants:
# - EWRP job ownership is enforced for authenticated API reads/writes.
# - Direct PDF links use short-lived random tokens scoped to one job; raw auth tokens are never put in URLs.
# - PDF token Redis ops are best-effort (``_ewrp_get_or_create_pdf_download_token``); authenticated download remains the fallback.
# - Failed DB commits/updates call ``_ewrp_rollback_session`` with structured warning logs (never silent rollback).
# Related:
# - EliteEW/api/main.py
# - api/core/async_utils.py
# - documentation/platform/AGENT-BACKGROUND-TASK-TRACKING.md
# ---
"""
EWRP — EliteEW Revolutionary Presentations.

New generator: landing-style HTML → Llama content → UGS images → screenshot per slide → PDF.
Separate from the classic Reveal.js presentations API.
"""

from __future__ import annotations

import logging
import os
import secrets
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import (  # type: ignore[import-untyped]
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
)
from fastapi import Path as FPath  # type: ignore[import-untyped]
from fastapi.responses import FileResponse  # type: ignore[import-untyped]
from sqlalchemy import delete, desc, select, update  # type: ignore[import-not-found]
from sqlalchemy.ext.asyncio import AsyncSession  # type: ignore[import-not-found]

from api.core.async_utils import correlation_id_from_request, track_background_task
from api.core.database_manager import get_database_manager, get_postgres_session
from api.core.oauth2_auth import get_optional_oauth2_user
from api.core.sidecar_errors import sidecar_http_exception
from api.models.database_models import GenerationType
from api.models.ewrp import EwrpJob
from api.routers.creative_studio_utils import raise_http_from_ugs_value_error
from api.schemas.ewrp import (
    EwrpCreateRequest,
    EwrpCreateResponse,
    EwrpJobListItem,
    EwrpRegenerateImageRequest,
    EwrpRegenerateTextRequest,
    EwrpSlidesUpdateRequest,
    EwrpStatusResponse,
)
from api.services.ewrp_idempotency import (
    EWRP_IDEMPOTENCY_TTL_SEC,
    ewrp_create_idempotency_redis_key,
    normalize_ewrp_create_idempotency_key,
)
from api.services.ewrp_retry_policy import ewrp_job_retry_allowed, ewrp_retry_requires_billing
from api.services.ewrp_service import EwrpService
from api.services.ewrp_status_service import (
    EWRP_PDF_TOKEN_PREFIX,
    ewrp_best_effort_delete_pdf_token,
    ewrp_build_status_response,
    ewrp_get_or_create_pdf_download_token,
    ewrp_slides_preview_from_job,
)
from api.services.ewrp_templates import normalize_ewrp_layout_key, normalize_presentation_theme
from api.services.queue_features import QUEUE_FLAG_EWRP, is_queue_enabled
from api.services.rabbitmq_service import get_rabbitmq_service
from api.services.rendering.browser_render_client import BrowserRenderUnavailableError
from api.services.ugs.billing_service import BillingService

router = APIRouter(prefix="/ewrp", tags=["EWRP - Revolutionary Presentations"])

_logger = logging.getLogger(__name__)

EWRP_UGS_IMAGE_TYPE_KEY = "image_generation_comfyui"
EWRP_SLIDE_TEXT_REGEN_TYPE_KEY = "ewrp_slide_text_regen"
EWRP_BILLING_TYPE_KEY = "ewrp_presentation"
EWRP_CREDITS_PER_SLIDE = 200


def _apply_ewrp_web_search_fields(job: EwrpJob, body: EwrpCreateRequest) -> None:
    from api.services.marketing_web_search_quality import (
        normalize_web_search_quality,
        web_search_enabled,
    )

    quality = normalize_web_search_quality(
        body.web_search_quality,
        use_web_search=body.use_web_search,
    )
    job.use_web_search = web_search_enabled(quality)  # type: ignore[assignment]
    job.web_search_quality = quality if web_search_enabled(quality) else None  # type: ignore[assignment]


def _copy_ewrp_web_search_fields(job: EwrpJob, src: EwrpJob) -> None:
    job.use_web_search = bool(getattr(src, "use_web_search", False))  # type: ignore[assignment]
    wsq = getattr(src, "web_search_quality", None)
    job.web_search_quality = str(wsq).strip() if isinstance(wsq, str) and str(wsq).strip() else None  # type: ignore[assignment]
    if job.use_web_search and not job.web_search_quality:
        job.web_search_quality = "standard"  # type: ignore[assignment]


async def _ewrp_rollback_session(
    db: AsyncSession,
    *,
    context: str,
    job_id: uuid.UUID | str | None = None,
    exc: BaseException | None = None,
) -> None:
    """Rollback SQLAlchemy session after a failed EWRP persistence step; never raises."""

    if exc is not None:
        _logger.warning(
            "EWRP DB persistence failed context=%s job_id=%s err=%s",
            context,
            job_id or "-",
            exc,
            exc_info=True,
        )
    try:
        await db.rollback()
    except Exception as rollback_exc:  # noqa: BLE001
        _logger.warning(
            "EWRP rollback() failed context=%s job_id=%s err=%s",
            context,
            job_id or "-",
            rollback_exc,
            exc_info=True,
        )


def _require_user(current_user):  # noqa: ANN001
    if current_user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return current_user


def _ewrp_job_output_dir(job_id: uuid.UUID) -> Path | None:
    base = os.environ.get("GENERATED_FILES_BASE", "").strip()
    if not base:
        return None
    return Path(base) / "generated_files" / "ewrp" / str(job_id)


async def _run_ewrp_slide_image_regen(
    job_id_str: str,
    user_id_str: str,
    slide_index: int,
    prompt: str,
    credit_amount: int,
    billing_type_key: str,
) -> None:
    """Background: UGS image for one slide + PDF rebuild; refund on failure."""
    manager = await get_database_manager()
    async with manager.get_postgres_session() as db:
        gt_stmt = select(GenerationType).where(
            GenerationType.type_key == billing_type_key,
            GenerationType.is_active.is_(True),
        )
        gt_result = await db.execute(gt_stmt)
        gen_type = gt_result.scalar_one_or_none()
        job_id = uuid.UUID(job_id_str)
        user_id = uuid.UUID(user_id_str)
        billing = BillingService(db)
        try:
            svc = EwrpService()
            await svc.regenerate_slide_image_workflow(db, job_id, user_id, slide_index, prompt)
        except Exception as e:
            _logger.exception("EWRP slide image regen failed job=%s", job_id_str)
            err_msg = str(e)
            if len(err_msg) > 500:
                err_msg = err_msg[:497] + "..."
            if gen_type:
                refunded = await billing.refund_credits(user_id_str, gen_type, credit_amount=credit_amount)
                if not refunded:
                    _logger.error("EWRP slide image regen: refund failed for user %s", user_id_str)
            try:
                await db.execute(
                    update(EwrpJob)
                    .where(EwrpJob.id == job_id)
                    .values(status="failed", progress=0, error_message=err_msg)
                )
                await db.commit()
            except Exception as persist_exc:
                await _ewrp_rollback_session(
                    db,
                    context="slide_image_regen_failed_status",
                    job_id=job_id,
                    exc=persist_exc,
                )


async def _run_ewrp_editor_missing_slide_images(
    job_id_str: str,
    user_id_str: str,
    slide_indices: list[int],
) -> None:
    """Background: UGS images for editor-added slides without files; same billing as manual regen per slide."""
    indices_sorted = sorted(slide_indices)
    if not indices_sorted:
        return
    _logger.info(
        "[STEP] EWRP editor missing slide images start job=%s indices=%s count=%s",
        job_id_str,
        indices_sorted,
        len(indices_sorted),
    )
    manager = await get_database_manager()
    for slide_index in indices_sorted:
        async with manager.get_postgres_session() as db:
            job_id = uuid.UUID(job_id_str)
            user_id = uuid.UUID(user_id_str)
            stmt_job = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
            result_job = await db.execute(stmt_job)
            job = result_job.scalar_one_or_none()
            if not job:
                return
            slides = job.slides_json or []
            if not isinstance(slides, list) or slide_index < 0 or slide_index >= len(slides):
                continue

            gt_stmt = select(GenerationType).where(
                GenerationType.type_key == EWRP_UGS_IMAGE_TYPE_KEY,
                GenerationType.is_active.is_(True),
            )
            gt_result = await db.execute(gt_stmt)
            gen_type = gt_result.scalar_one_or_none()
            billing = BillingService(db)
            if not gen_type:
                _logger.error("EWRP editor missing images: generation type %s missing", EWRP_UGS_IMAGE_TYPE_KEY)
                try:
                    await db.execute(
                        update(EwrpJob)
                        .where(EwrpJob.id == job_id)
                        .values(
                            status="failed",
                            progress=0,
                            error_message="Тип генерации изображений для UGS не настроен.",
                        )
                    )
                    await db.commit()
                except Exception as persist_exc:
                    await _ewrp_rollback_session(
                        db,
                        context="editor_missing_gen_type_status",
                        job_id=job_id,
                        exc=persist_exc,
                    )
                return
            credit_cost = int(float(gen_type.cost_credits)) if gen_type.cost_credits is not None else 50
            try:
                await billing.check_limits(user_id_str, gen_type, credit_amount=float(credit_cost))
            except ValueError as e:
                _logger.warning("EWRP editor missing: billing limits job=%s: %s", job_id_str, e)
                try:
                    await db.execute(
                        update(EwrpJob)
                        .where(EwrpJob.id == job_id)
                        .values(status="failed", progress=0, error_message=str(e)[:500])
                    )
                    await db.commit()
                except Exception as persist_exc:
                    await _ewrp_rollback_session(
                        db,
                        context="editor_missing_billing_limit_status",
                        job_id=job_id,
                        exc=persist_exc,
                    )
                return
            if not await billing.record_usage(user_id_str, gen_type, credit_amount=credit_cost):
                try:
                    await db.execute(
                        update(EwrpJob)
                        .where(EwrpJob.id == job_id)
                        .values(
                            status="failed", progress=0, error_message="Insufficient credits for UGS image generation."
                        )
                    )
                    await db.commit()
                except Exception as persist_exc:
                    await _ewrp_rollback_session(
                        db,
                        context="editor_missing_insufficient_credits_status",
                        job_id=job_id,
                        exc=persist_exc,
                    )
                return

            topic = (job.topic or job.title or "").strip()
            slide = slides[slide_index] if isinstance(slides[slide_index], dict) else {}
            svc = EwrpService()
            try:
                prompt = await svc.editor_resolve_image_prompt_for_slide(db, slide, topic, slide_index)
            except Exception as e:
                _logger.exception("EWRP editor auto prompt failed job=%s slide=%s", job_id_str, slide_index)
                refunded = await billing.refund_credits(user_id_str, gen_type, credit_amount=credit_cost)
                if not refunded:
                    _logger.error("EWRP editor missing: refund failed user=%s", user_id_str)
                try:
                    await db.execute(
                        update(EwrpJob)
                        .where(EwrpJob.id == job_id)
                        .values(status="failed", progress=0, error_message=str(e)[:500])
                    )
                    await db.commit()
                except Exception as persist_exc:
                    await _ewrp_rollback_session(
                        db,
                        context="editor_missing_auto_prompt_status",
                        job_id=job_id,
                        exc=persist_exc,
                    )
                return

            try:
                await svc.regenerate_slide_image_workflow(
                    db,
                    job_id,
                    user_id,
                    slide_index,
                    prompt,
                    skip_final_rebuild=True,
                )
            except Exception as e:
                _logger.exception("EWRP editor missing slide image failed job=%s slide=%s", job_id_str, slide_index)
                err_msg = str(e)
                if len(err_msg) > 500:
                    err_msg = err_msg[:497] + "..."
                refunded = await billing.refund_credits(user_id_str, gen_type, credit_amount=credit_cost)
                if not refunded:
                    _logger.error("EWRP editor missing slide: refund failed for user %s", user_id_str)
                try:
                    await db.execute(
                        update(EwrpJob)
                        .where(EwrpJob.id == job_id)
                        .values(status="failed", progress=0, error_message=err_msg)
                    )
                    await db.commit()
                except Exception as persist_exc:
                    await _ewrp_rollback_session(
                        db,
                        context="editor_missing_slide_image_status",
                        job_id=job_id,
                        exc=persist_exc,
                    )
                return

    job_id_final = uuid.UUID(job_id_str)
    user_id_final = uuid.UUID(user_id_str)
    async with manager.get_postgres_session() as db:
        stmt_final = select(EwrpJob).where(EwrpJob.id == job_id_final, EwrpJob.user_id == user_id_final)
        result_final = await db.execute(stmt_final)
        job_final = result_final.scalar_one_or_none()
        if not job_final:
            return
        svc_final = EwrpService()
        try:
            await svc_final.rebuild_from_slides(job_final, db)
        except Exception as e:
            _logger.exception("EWRP editor missing images: final PDF rebuild failed job=%s", job_id_str)
            err_msg = str(e)
            if len(err_msg) > 500:
                err_msg = err_msg[:497] + "..."
            try:
                await db.execute(
                    update(EwrpJob)
                    .where(EwrpJob.id == job_id_final)
                    .values(status="failed", progress=0, error_message=err_msg)
                )
                await db.commit()
            except Exception as persist_exc:
                await _ewrp_rollback_session(
                    db,
                    context="editor_missing_final_rebuild_status",
                    job_id=job_id_final,
                    exc=persist_exc,
                )


async def _run_ewrp_slide_text_regen(
    job_id_str: str,
    user_id_str: str,
    slide_index: int,
    instruction: str | None,
    credit_amount: int,
    billing_type_key: str,
) -> None:
    """Background: LLM rewrite one slide + PDF rebuild; refund on failure."""
    manager = await get_database_manager()
    async with manager.get_postgres_session() as db:
        gt_stmt = select(GenerationType).where(
            GenerationType.type_key == billing_type_key,
            GenerationType.is_active.is_(True),
        )
        gt_result = await db.execute(gt_stmt)
        gen_type = gt_result.scalar_one_or_none()
        job_id = uuid.UUID(job_id_str)
        user_id = uuid.UUID(user_id_str)
        billing = BillingService(db)
        try:
            svc = EwrpService()
            await svc.regenerate_slide_text_workflow(db, job_id, user_id, slide_index, instruction)
        except Exception as e:
            _logger.exception("EWRP slide text regen failed job=%s", job_id_str)
            err_msg = str(e)
            if len(err_msg) > 500:
                err_msg = err_msg[:497] + "..."
            if gen_type:
                refunded = await billing.refund_credits(user_id_str, gen_type, credit_amount=credit_amount)
                if not refunded:
                    _logger.error("EWRP slide text regen: refund failed for user %s", user_id_str)
            try:
                await db.execute(
                    update(EwrpJob)
                    .where(EwrpJob.id == job_id)
                    .values(status="failed", progress=0, error_message=err_msg)
                )
                await db.commit()
            except Exception as persist_exc:
                await _ewrp_rollback_session(
                    db,
                    context="slide_text_regen_failed_status",
                    job_id=job_id,
                    exc=persist_exc,
                )


async def _ewrp_try_idempotency_replay(
    user_id: uuid.UUID,
    idem_key: str,
    db: AsyncSession,
) -> EwrpCreateResponse | None:
    try:
        manager = await get_database_manager()
        redis = await manager.get_redis_client()
        if not redis:
            return None
        rkey = ewrp_create_idempotency_redis_key(user_id, idem_key)
        stored = await redis.get(rkey)
    except Exception:
        _logger.debug("EWRP idempotency replay: redis read skipped", exc_info=True)
        return None
    if not stored:
        return None
    jid_raw = stored.decode() if isinstance(stored, bytes) else stored
    try:
        jid = uuid.UUID(str(jid_raw).strip())
    except (ValueError, TypeError):  # fmt: skip
        return None
    stmt = select(EwrpJob).where(EwrpJob.id == jid, EwrpJob.user_id == user_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        return None
    return EwrpCreateResponse(
        id=job.id,
        status=job.status or "queued",
        message="Запрос с этим Idempotency-Key уже обрабатывался. Используйте GET /ewrp/{id}/status.",
    )


async def _ewrp_remember_idempotency_key(
    user_id: uuid.UUID,
    idem_key: str,
    job_id: uuid.UUID,
) -> None:
    try:
        manager = await get_database_manager()
        redis = await manager.get_redis_client()
        if not redis:
            return
        rkey = ewrp_create_idempotency_redis_key(user_id, idem_key)
        await redis.setex(rkey, EWRP_IDEMPOTENCY_TTL_SEC, str(job_id))
    except Exception:
        _logger.debug("EWRP idempotency cache write skipped", exc_info=True)


async def _ewrp_claim_idempotency_key(user_id: uuid.UUID, idem_key: str) -> bool:
    try:
        manager = await get_database_manager()
        redis = await manager.get_redis_client()
        if not redis:
            return True
        rkey = ewrp_create_idempotency_redis_key(user_id, idem_key)
        return bool(await redis.set(rkey, "in_progress", nx=True, ex=EWRP_IDEMPOTENCY_TTL_SEC))
    except Exception:
        _logger.debug("EWRP idempotency claim skipped", exc_info=True)
        return True


async def _ewrp_release_idempotency_claim(user_id: uuid.UUID, idem_key: str) -> None:
    try:
        manager = await get_database_manager()
        redis = await manager.get_redis_client()
        if not redis:
            return
        rkey = ewrp_create_idempotency_redis_key(user_id, idem_key)
        stored = await redis.get(rkey)
        value = stored.decode() if isinstance(stored, bytes) else stored
        if value == "in_progress":
            await redis.delete(rkey)
    except Exception:
        _logger.debug("EWRP idempotency claim release skipped", exc_info=True)


async def _run_ewrp_pipeline(job_id_str: str, user_id_str: str) -> None:
    """Background task: run EWRP pipeline with its own DB session."""
    from api.services.ewrp_queue_resilience import finalize_ewrp_job_queue_failure

    try:
        manager = await get_database_manager()
        async with manager.get_postgres_session() as db:
            job_id = uuid.UUID(job_id_str)
            user_id = uuid.UUID(user_id_str)
            stmt = select(EwrpJob).where(EwrpJob.id == job_id)
            result = await db.execute(stmt)
            job = result.scalar_one_or_none()
            if not job:
                return
            svc = EwrpService()
            await svc.run_pipeline(
                job_id=job_id,
                user_id=user_id,
                title=job.title,
                topic=job.topic,
                num_slides=job.num_slides,
                db=db,
                extra_context=getattr(job, "extra_context", None),
                source_content_id=getattr(job, "source_content_id", None),
                job_entity=job,
            )
    except Exception as exc:
        _logger.exception("EWRP pipeline failed for job %s", job_id_str)
        await finalize_ewrp_job_queue_failure(job_id_str, user_id_str, str(exc), refund=True)


async def _enqueue_ewrp_pipeline(
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    correlation_id: str | None = None,
) -> None:
    user_id_str = str(user_id)
    job_id_str = str(job_id)
    corr = str(correlation_id or job_id_str).strip() or job_id_str
    meta = {"job_id": job_id_str, "user_id": user_id_str}

    def _spawn_pipeline() -> None:
        track_background_task(
            _run_ewrp_pipeline(job_id_str, user_id_str),
            name="ewrp_pipeline",
            correlation_id=corr,
            metadata=meta,
        )

    if is_queue_enabled(QUEUE_FLAG_EWRP, default=True):
        published = await get_rabbitmq_service().publish_ai_generation(
            request_id=job_id_str,
            type_key="ewrp_generate",
            payload={
                "task_type": "ewrp_generate",
                "job_id": job_id_str,
                "user_id": user_id_str,
                "correlation_id": corr,
            },
        )
        if not published:
            _spawn_pipeline()
    else:
        _spawn_pipeline()


@router.post("", response_model=EwrpCreateResponse)
async def create_ewrp(
    body: EwrpCreateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
) -> EwrpCreateResponse:
    """Create a new EWRP job and start generation in background."""
    _require_user(current_user)
    user_id = uuid.UUID(str(current_user.id))

    idem_raw = normalize_ewrp_create_idempotency_key(
        request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
    )
    _ = background_tasks  # pipeline enqueue is handled in create helper below
    return await create_ewrp_job_for_user(
        db,
        user_id=user_id,
        body=body,
        idempotency_key=idem_raw,
        correlation_id=correlation_id_from_request(request),
    )


async def create_ewrp_job_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    body: EwrpCreateRequest,
    idempotency_key: str | None = None,
    correlation_id: str | None = None,
) -> EwrpCreateResponse:
    """Create EWRP job row, bill user, and enqueue generation pipeline."""
    user_id_str = str(user_id)
    idem_raw = normalize_ewrp_create_idempotency_key(idempotency_key)
    if idem_raw:
        replay = await _ewrp_try_idempotency_replay(user_id, idem_raw, db)
        if replay is not None:
            return replay
        if not await _ewrp_claim_idempotency_key(user_id, idem_raw):
            raise HTTPException(
                status_code=202,
                detail="EWRP request with this Idempotency-Key is already in progress",
            )

    gt_stmt = select(GenerationType).where(
        GenerationType.type_key == EWRP_BILLING_TYPE_KEY,
        GenerationType.is_active.is_(True),
    )
    gt_result = await db.execute(gt_stmt)
    gen_type = gt_result.scalar_one_or_none()
    if not gen_type:
        raise HTTPException(
            status_code=503,
            detail="EWRP billing is not configured (generation type ewrp_presentation missing).",
        )

    num_slides = int(body.num_slides)
    credit_cost = num_slides * EWRP_CREDITS_PER_SLIDE

    billing = BillingService(db)
    try:
        await billing.check_limits(user_id_str, gen_type, credit_amount=float(credit_cost))
    except ValueError as e:
        raise_http_from_ugs_value_error(e)

    if not await billing.record_usage(user_id_str, gen_type, credit_amount=credit_cost):
        if idem_raw:
            await _ewrp_release_idempotency_claim(user_id, idem_raw)
        raise HTTPException(status_code=402, detail="Insufficient credits for presentation generation.")

    title = (body.title or body.topic[:100]).strip() or "Презентация"
    job = EwrpJob(
        user_id=user_id,
        title=title,
        topic=body.topic.strip(),
        num_slides=num_slides,
        status="queued",
        progress=0,
    )
    if body.extra_context:
        job.extra_context = body.extra_context.strip()  # type: ignore[assignment]
    if body.source_content_id:
        job.source_content_id = body.source_content_id  # type: ignore[assignment]
    nl = normalize_ewrp_layout_key(body.default_slide_layout)
    if nl:
        job.default_slide_layout = nl  # type: ignore[assignment]
    pt_in = body.presentation_theme if isinstance(body.presentation_theme, str) else None
    job.presentation_theme = normalize_presentation_theme(  # type: ignore[assignment]
        pt_in.strip() if pt_in and pt_in.strip() else None
    )
    _apply_ewrp_web_search_fields(job, body)
    db.add(job)
    try:
        await db.commit()
        await db.refresh(job)
    except Exception as exc:
        await _ewrp_rollback_session(db, context="create_job_commit", job_id=job.id, exc=exc)
        if idem_raw:
            await _ewrp_release_idempotency_claim(user_id, idem_raw)
        refunded = await billing.refund_credits(user_id_str, gen_type, credit_amount=credit_cost)
        if not refunded:
            _logger.error("EWRP: failed to refund credits after job persist error for user %s", user_id_str)
        raise
    await _enqueue_ewrp_pipeline(
        job.id,
        user_id,
        correlation_id=correlation_id or str(job.id),
    )
    if idem_raw:
        await _ewrp_remember_idempotency_key(user_id, idem_raw, job.id)
    return EwrpCreateResponse(
        id=job.id,
        status="queued",
        message="Генерация запущена. Опрашивайте GET /api/v1/ewrp/{id}/status",
    )


@router.post("/{job_id}/duplicate", response_model=EwrpCreateResponse)
async def duplicate_ewrp_job(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
) -> EwrpCreateResponse:
    """Новая задача с теми же вводными, что и существующая (отдельное списание, новый id)."""
    _require_user(current_user)
    user_id = uuid.UUID(str(current_user.id))
    user_id_str = str(user_id)

    stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
    result = await db.execute(stmt)
    src = result.scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="EWRP job not found")

    gt_stmt = select(GenerationType).where(
        GenerationType.type_key == EWRP_BILLING_TYPE_KEY,
        GenerationType.is_active.is_(True),
    )
    gt_result = await db.execute(gt_stmt)
    gen_type = gt_result.scalar_one_or_none()
    if not gen_type:
        raise HTTPException(
            status_code=503,
            detail="EWRP billing is not configured (generation type ewrp_presentation missing).",
        )

    num_slides = int(src.num_slides or 5)
    credit_cost = num_slides * EWRP_CREDITS_PER_SLIDE

    billing = BillingService(db)
    try:
        await billing.check_limits(user_id_str, gen_type, credit_amount=float(credit_cost))
    except ValueError as e:
        raise_http_from_ugs_value_error(e)

    if not await billing.record_usage(user_id_str, gen_type, credit_amount=credit_cost):
        raise HTTPException(status_code=402, detail="Insufficient credits for presentation generation.")

    job = EwrpJob(
        user_id=user_id,
        title=(src.title or "").strip() or "Презентация",
        topic=(src.topic or "").strip() or "Тема",
        num_slides=num_slides,
        status="queued",
        progress=0,
    )
    ec = getattr(src, "extra_context", None)
    if ec and str(ec).strip():
        job.extra_context = str(ec).strip()  # type: ignore[assignment]
    scid = getattr(src, "source_content_id", None)
    if scid is not None:
        job.source_content_id = scid  # type: ignore[assignment]
    src_layout = getattr(src, "default_slide_layout", None)
    dup_nl = normalize_ewrp_layout_key(src_layout if isinstance(src_layout, str) else None)
    if dup_nl:
        job.default_slide_layout = dup_nl  # type: ignore[assignment]
    src_pt = getattr(src, "presentation_theme", None)
    job.presentation_theme = normalize_presentation_theme(  # type: ignore[assignment]
        src_pt.strip() if isinstance(src_pt, str) and src_pt.strip() else None
    )
    _copy_ewrp_web_search_fields(job, src)

    db.add(job)
    try:
        await db.commit()
        await db.refresh(job)
    except Exception as exc:
        await _ewrp_rollback_session(db, context="duplicate_job_commit", job_id=job.id, exc=exc)
        refunded = await billing.refund_credits(user_id_str, gen_type, credit_amount=credit_cost)
        if not refunded:
            _logger.error("EWRP duplicate: failed to refund after persist error for user %s", user_id_str)
        raise
    if is_queue_enabled(QUEUE_FLAG_EWRP, default=True):
        published = await get_rabbitmq_service().publish_ai_generation(
            request_id=str(job.id),
            type_key="ewrp_generate",
            payload={
                "task_type": "ewrp_generate",
                "job_id": str(job.id),
                "user_id": str(user_id),
            },
        )
        if not published:
            background_tasks.add_task(_run_ewrp_pipeline, str(job.id), str(user_id))
    else:
        background_tasks.add_task(_run_ewrp_pipeline, str(job.id), str(user_id))
    return EwrpCreateResponse(
        id=job.id,
        status="queued",
        message="Дубликат задачи создан. Опрашивайте GET /api/v1/ewrp/{id}/status",
    )


@router.post("/{job_id}/retry", response_model=EwrpCreateResponse)
async def retry_ewrp_job(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
) -> EwrpCreateResponse:
    """
    Повторить генерацию в **той же** задаче.

    - ``failed`` — новое списание (после refund) и полный перезапуск пайплайна.
    - «Зависшие» нефинальные статусы (нет обновления > 2 ч) — повторная постановка в очередь **без** списания.
    """
    _require_user(current_user)
    user_id = uuid.UUID(str(current_user.id))
    user_id_str = str(user_id)

    stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="EWRP job not found")

    updated_at = getattr(job, "updated_at", None)
    if not ewrp_job_retry_allowed(job.status, updated_at):
        raise HTTPException(
            status_code=400,
            detail="Повтор доступен для failed или зависших задач (нет прогресса более 2 часов).",
        )

    gt_stmt = select(GenerationType).where(
        GenerationType.type_key == EWRP_BILLING_TYPE_KEY,
        GenerationType.is_active.is_(True),
    )
    gt_result = await db.execute(gt_stmt)
    gen_type = gt_result.scalar_one_or_none()
    if not gen_type:
        raise HTTPException(
            status_code=503,
            detail="EWRP billing is not configured (generation type ewrp_presentation missing).",
        )

    billing = BillingService(db)
    num_slides = int(job.num_slides or 5)
    credit_cost = num_slides * EWRP_CREDITS_PER_SLIDE
    requires_billing = ewrp_retry_requires_billing(job.status)

    if requires_billing:
        try:
            await billing.check_limits(user_id_str, gen_type, credit_amount=float(credit_cost))
        except ValueError as e:
            raise_http_from_ugs_value_error(e)
        if not await billing.record_usage(user_id_str, gen_type, credit_amount=credit_cost):
            raise HTTPException(status_code=402, detail="Insufficient credits for presentation generation.")

    await db.execute(
        update(EwrpJob)
        .where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
        .values(
            status="queued",
            progress=0,
            error_message=None,
            pdf_path=None,
            slides_json=None,
            completed_at=None,
        )
    )
    try:
        await db.commit()
        await db.refresh(job)
    except Exception as exc:
        await _ewrp_rollback_session(db, context="retry_job_commit", job_id=job_id, exc=exc)
        if requires_billing:
            refunded = await billing.refund_credits(user_id_str, gen_type, credit_amount=credit_cost)
            if not refunded:
                _logger.error("EWRP retry: failed to refund after persist error user=%s", user_id_str)
        raise

    if is_queue_enabled(QUEUE_FLAG_EWRP, default=True):
        published = await get_rabbitmq_service().publish_ai_generation(
            request_id=str(job.id),
            type_key="ewrp_generate",
            payload={
                "task_type": "ewrp_generate",
                "job_id": str(job.id),
                "user_id": str(user_id),
            },
        )
        if not published:
            background_tasks.add_task(_run_ewrp_pipeline, str(job.id), str(user_id))
    else:
        background_tasks.add_task(_run_ewrp_pipeline, str(job.id), str(user_id))

    return EwrpCreateResponse(
        id=job.id,
        status="queued",
        message="Повтор генерации запущен. Опрашивайте GET /api/v1/ewrp/{id}/status",
    )


@router.get("/jobs", response_model=list[EwrpJobListItem])
async def list_ewrp_jobs(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
) -> list[EwrpJobListItem]:
    """Список EWRP-задач текущего пользователя (новые сверху)."""
    _require_user(current_user)
    user_id = uuid.UUID(str(current_user.id))
    stmt = (
        select(EwrpJob).where(EwrpJob.user_id == user_id).order_by(desc(EwrpJob.created_at)).limit(limit).offset(offset)
    )
    result = await db.execute(stmt)
    jobs = result.scalars().all()
    return [
        EwrpJobListItem(
            id=j.id,
            title=j.title or "",
            topic=j.topic or "",
            num_slides=int(j.num_slides or 0),
            status=j.status or "queued",
            progress=int(j.progress or 0),
            error_message=getattr(j, "error_message", None),
            created_at=j.created_at,
            updated_at=j.updated_at,
            completed_at=j.completed_at,
        )
        for j in jobs
    ]


@router.get("/{job_id}/status", response_model=EwrpStatusResponse)
async def get_ewrp_status(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
) -> EwrpStatusResponse:
    """Get EWRP job status and progress. When completed, returns pdf_download_token for direct link."""
    _require_user(current_user)
    user_id = uuid.UUID(str(current_user.id))
    stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="EWRP job not found")
    return await ewrp_build_status_response(job_id, job)


@router.get("/{job_id}/pdf")
async def download_ewrp_pdf(
    job_id: uuid.UUID,
    token: str | None = Query(None, description="Short-lived download token from status (no Auth needed)"),
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
) -> FileResponse:
    """Download EWRP result as PDF. Use ``?token=`` from status response for direct links (no Auth)."""
    import os  # noqa: PLC0415

    job = None
    if token:
        try:
            manager = await get_database_manager()
            redis = await manager.get_redis_client()
            if redis:
                key = f"{EWRP_PDF_TOKEN_PREFIX}{job_id}"
                stored = await redis.get(key)
                expected = stored.decode() if isinstance(stored, bytes) else stored
                if expected and secrets.compare_digest(token, expected):
                    stmt = select(EwrpJob).where(EwrpJob.id == job_id)
                    result = await db.execute(stmt)
                    job = result.scalar_one_or_none()
        except Exception as exc:  # noqa: BLE001 — fall through to authenticated owner lookup
            _logger.debug(
                "EWRP PDF token download auth skipped job_id=%s err=%s",
                job_id,
                exc,
                exc_info=True,
            )
    if not job:
        _require_user(current_user)
        user_id = uuid.UUID(str(current_user.id))
        stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="EWRP job not found")
    if job.status != "completed" or not job.pdf_path:
        raise HTTPException(status_code=400, detail="PDF not ready yet. Check status.")
    file_path = job.pdf_path
    if not os.path.isfile(file_path):
        # Fallback: try canonical path (same as ewrp_service) in case DB path is from another host/container
        base = os.environ.get("GENERATED_FILES_BASE", "").strip()
        if base:
            from pathlib import Path  # noqa: PLC0415

            canonical = Path(base) / "generated_files" / "ewrp" / str(job_id) / "presentation.pdf"
            if os.path.isfile(canonical):
                file_path = str(canonical)
        if not os.path.isfile(file_path):
            import logging

            logging.getLogger(__name__).warning(
                "EWRP PDF not found on disk: tried %r and canonical; job_id=%s",
                job.pdf_path,
                job_id,
            )
            raise HTTPException(
                status_code=404,
                detail="PDF file not found on server. It may have been removed or the job ran on another instance.",
            )
    # Same URL for every download; browsers/proxies cache GET aggressively — file on disk is overwritten on rebuild.
    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=f"ewrp_{job_id}.pdf",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


def _ewrp_slide_image_filename(job: EwrpJob, slide_index: int) -> str:
    slides = job.slides_json if isinstance(job.slides_json, list) else []
    filename: str | None = None
    if slide_index < len(slides):
        slide = slides[slide_index]
        if isinstance(slide, dict):
            raw = slide.get("image_filename")
            if isinstance(raw, str) and raw.strip():
                filename = raw.strip()
    return filename or f"slide_{slide_index + 1}.png"


@router.get("/{job_id}/slides/{slide_index}/image")
async def download_ewrp_slide_image(
    job_id: uuid.UUID,
    slide_index: int,
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
) -> FileResponse:
    """Download PNG preview for one EWRP slide (authenticated job owner only)."""
    _require_user(current_user)
    if slide_index < 0:
        raise HTTPException(status_code=400, detail="slide_index must be non-negative")
    user_id = uuid.UUID(str(current_user.id))
    stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="EWRP job not found")

    out_dir = _ewrp_job_output_dir(job_id)
    if not out_dir:
        raise HTTPException(status_code=404, detail="Slide image storage is not configured")

    filename = _ewrp_slide_image_filename(job, slide_index)
    file_path = out_dir / filename
    if not file_path.is_file():
        fallback = out_dir / f"slide_{slide_index + 1}.png"
        if fallback.is_file():
            file_path = fallback
            filename = fallback.name
        else:
            raise HTTPException(status_code=404, detail="Slide image not found on server")

    return FileResponse(
        file_path,
        media_type="image/png",
        filename=filename,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.delete("/{job_id}", status_code=204)
async def delete_ewrp_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
) -> Response:
    """Удалить задачу EWRP текущего пользователя, файлы в generated_files/ewrp/{id} и запись в БД."""
    _require_user(current_user)
    user_id = uuid.UUID(str(current_user.id))
    exists = await db.execute(select(EwrpJob.id).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id))
    if exists.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="EWRP job not found")

    out_dir = _ewrp_job_output_dir(job_id)
    if out_dir and out_dir.is_dir():
        shutil.rmtree(out_dir, ignore_errors=True)

    await ewrp_best_effort_delete_pdf_token(job_id)

    await db.execute(delete(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id))
    await db.commit()
    return Response(status_code=204)


@router.put("/{job_id}/slides", response_model=EwrpStatusResponse)
async def update_ewrp_slides(
    job_id: uuid.UUID,
    body: EwrpSlidesUpdateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
) -> EwrpStatusResponse:
    """Update EWRP slides; rebuild PDF when all slide images exist, otherwise queue UGS for missing slides."""
    user = _require_user(current_user)
    user_id = uuid.UUID(str(user.id))

    stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="EWRP job not found")

    if job.status not in ("completed", "failed"):
        raise HTTPException(
            status_code=400,
            detail="Нельзя редактировать слайды, пока генерация не завершена.",
        )

    if not body.slides:
        raise HTTPException(status_code=400, detail="Список слайдов пуст.")

    # Простая валидация полей + сохранение image_filename, даже если редактор его не прислал
    old_slides = job.slides_json or []
    slides_json: list[dict[str, Any]] = []
    for idx, s in enumerate(body.slides):
        title = (s.title or "").strip()
        if not title:
            raise HTTPException(
                status_code=400,
                detail=f"Слайд {idx + 1}: заголовок не может быть пустым.",
            )
        bullets = [b.strip() for b in s.bullets if b and b.strip()]
        existing_img = None
        if isinstance(old_slides, list) and idx < len(old_slides):
            old = old_slides[idx]
            if isinstance(old, dict):
                existing_img = old.get("image_filename")
        image_filename = s.image_filename if s.image_filename not in (None, "") else existing_img
        existing_prompt = None
        if isinstance(old_slides, list) and idx < len(old_slides):
            old = old_slides[idx]
            if isinstance(old, dict):
                existing_prompt = old.get("image_prompt")
        image_prompt = (
            (s.image_prompt or "").strip() or existing_prompt if s.image_prompt is not None else existing_prompt
        )
        existing_layout = None
        if isinstance(old_slides, list) and idx < len(old_slides):
            old = old_slides[idx]
            if isinstance(old, dict):
                existing_layout = old.get("layout") or old.get("slide_layout")
        layout_out: str | None = None
        if s.layout is not None:
            stripped = (s.layout or "").strip()
            layout_out = stripped if stripped else None
        elif isinstance(existing_layout, str) and existing_layout.strip():
            layout_out = existing_layout.strip()
        row: dict[str, Any] = {
            "title": title,
            "bullets": bullets,
            "image_filename": image_filename,
        }
        if image_prompt:
            row["image_prompt"] = image_prompt
        if layout_out:
            row["layout"] = layout_out
        slides_json.append(row)

    # Если в JSON нет image_filename (старые джобы) — подставляем из файлов на диске
    base = os.environ.get("GENERATED_FILES_BASE", "").strip()
    output_dir: Path | None = None
    if base:
        output_dir = Path(base) / "generated_files" / "ewrp" / str(job_id)
        for idx, slide in enumerate(slides_json):
            if not slide.get("image_filename"):
                fallback = f"slide_{idx + 1}.png"
                if (output_dir / fallback).is_file():
                    slide["image_filename"] = fallback

    missing_indices: list[int] = []
    if output_dir is not None:
        for idx, slide in enumerate(slides_json):
            img = slide.get("image_filename")
            if img and (output_dir / str(img)).is_file():
                continue
            fb = f"slide_{idx + 1}.png"
            if (output_dir / fb).is_file():
                slide["image_filename"] = fb
                continue
            missing_indices.append(idx)
    else:
        for idx, slide in enumerate(slides_json):
            if not slide.get("image_filename"):
                missing_indices.append(idx)

    job.slides_json = slides_json  # type: ignore[assignment]
    job.num_slides = len(slides_json)  # type: ignore[assignment]
    job.error_message = None  # type: ignore[assignment]
    if missing_indices:
        job.status = "generating_images"  # type: ignore[assignment]
        job.progress = 20  # type: ignore[assignment]

    await db.commit()

    if missing_indices:
        background_tasks.add_task(
            _run_ewrp_editor_missing_slide_images,
            str(job_id),
            str(user_id),
            missing_indices,
        )
    else:
        svc = EwrpService()
        stmt_reload = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
        result_reload = await db.execute(stmt_reload)
        job_for_rebuild = result_reload.scalar_one_or_none()
        if job_for_rebuild:
            try:
                await svc.rebuild_from_slides(job_for_rebuild, db)
            except BrowserRenderUnavailableError as exc:
                raise sidecar_http_exception(exc, service="browser-render") from exc

    # Обновлённый job для ответа
    stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="EWRP job not found after update")

    pdf_url = None
    pdf_download_token = None
    if job.status == "completed" and job.pdf_path:
        pdf_url = f"/api/v1/ewrp/{job_id}/pdf"
        pdf_download_token = await ewrp_get_or_create_pdf_download_token(job_id)

    slides_preview = ewrp_slides_preview_from_job(job)

    return EwrpStatusResponse(
        id=job.id,
        status=job.status or "queued",
        progress=job.progress or 0,
        error_message=job.error_message,
        pdf_url=pdf_url,
        pdf_download_token=pdf_download_token,
        slides=slides_preview,
        topic=job.topic,
        title=job.title,
        num_slides=int(job.num_slides) if job.num_slides is not None else None,
        extra_context=getattr(job, "extra_context", None),
        source_content_id=getattr(job, "source_content_id", None),
        presentation_theme=getattr(job, "presentation_theme", None),
        default_slide_layout=getattr(job, "default_slide_layout", None),
        web_search_quality=getattr(job, "web_search_quality", None),
        use_web_search=bool(getattr(job, "use_web_search", False)),
        updated_at=getattr(job, "updated_at", None),
    )


@router.post(
    "/{job_id}/slides/{slide_index}/regenerate-image",
    response_model=EwrpStatusResponse,
)
async def ewrp_regenerate_slide_image(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
    slide_index: int = FPath(..., ge=0, le=19),
    body: EwrpRegenerateImageRequest = ...,
) -> EwrpStatusResponse:
    """Перегенерация визуала одного слайда через UGS (списание как у image_generation_comfyui)."""
    user = _require_user(current_user)
    user_id = uuid.UUID(str(user.id))
    user_id_str = str(user_id)

    stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="EWRP job not found")
    if job.status not in ("completed", "failed"):
        raise HTTPException(
            status_code=400,
            detail="Дождитесь завершения текущей операции.",
        )
    slides = job.slides_json or []
    if not isinstance(slides, list) or slide_index < 0 or slide_index >= len(slides):
        raise HTTPException(status_code=400, detail="Неверный индекс слайда.")

    gt_stmt = select(GenerationType).where(
        GenerationType.type_key == EWRP_UGS_IMAGE_TYPE_KEY,
        GenerationType.is_active.is_(True),
    )
    gt_result = await db.execute(gt_stmt)
    gen_type = gt_result.scalar_one_or_none()
    if not gen_type:
        raise HTTPException(
            status_code=503,
            detail="Тип генерации изображений для UGS не настроен.",
        )

    credit_cost = int(float(gen_type.cost_credits)) if gen_type.cost_credits is not None else 50
    billing = BillingService(db)
    try:
        await billing.check_limits(user_id_str, gen_type, credit_amount=float(credit_cost))
    except ValueError as e:
        raise_http_from_ugs_value_error(e)

    if not await billing.record_usage(user_id_str, gen_type, credit_amount=credit_cost):
        raise HTTPException(status_code=402, detail="Insufficient credits for UGS image generation.")

    job.status = "generating_images"  # type: ignore[assignment]
    job.progress = 20  # type: ignore[assignment]
    job.error_message = None  # type: ignore[assignment]
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(
        _run_ewrp_slide_image_regen,
        str(job_id),
        user_id_str,
        slide_index,
        body.prompt.strip(),
        credit_cost,
        EWRP_UGS_IMAGE_TYPE_KEY,
    )

    return await ewrp_build_status_response(job_id, job)


@router.post(
    "/{job_id}/slides/{slide_index}/regenerate-text",
    response_model=EwrpStatusResponse,
)
async def ewrp_regenerate_slide_text(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_postgres_session),
    current_user=Depends(get_optional_oauth2_user),
    slide_index: int = FPath(..., ge=0, le=19),
    body: EwrpRegenerateTextRequest = ...,
) -> EwrpStatusResponse:
    """Перегенерация текста одного слайда (отдельное списание, каталог UGS)."""
    user = _require_user(current_user)
    user_id = uuid.UUID(str(user.id))
    user_id_str = str(user_id)

    stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="EWRP job not found")
    if job.status not in ("completed", "failed"):
        raise HTTPException(
            status_code=400,
            detail="Дождитесь завершения текущей операции.",
        )
    slides = job.slides_json or []
    if not isinstance(slides, list) or slide_index < 0 or slide_index >= len(slides):
        raise HTTPException(status_code=400, detail="Неверный индекс слайда.")

    gt_stmt = select(GenerationType).where(
        GenerationType.type_key == EWRP_SLIDE_TEXT_REGEN_TYPE_KEY,
        GenerationType.is_active.is_(True),
    )
    gt_result = await db.execute(gt_stmt)
    gen_type = gt_result.scalar_one_or_none()
    if not gen_type:
        raise HTTPException(
            status_code=503,
            detail="Тип перегенерации текста слайда EWRP не настроен.",
        )

    credit_cost = int(float(gen_type.cost_credits)) if gen_type.cost_credits is not None else 40
    billing = BillingService(db)
    try:
        await billing.check_limits(user_id_str, gen_type, credit_amount=float(credit_cost))
    except ValueError as e:
        raise_http_from_ugs_value_error(e)

    if not await billing.record_usage(user_id_str, gen_type, credit_amount=credit_cost):
        raise HTTPException(status_code=402, detail="Insufficient credits for slide text regeneration.")

    instr = body.instruction.strip() if body.instruction else None

    job.status = "generating_content"  # type: ignore[assignment]
    job.progress = 25  # type: ignore[assignment]
    job.error_message = None  # type: ignore[assignment]
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(
        _run_ewrp_slide_text_regen,
        str(job_id),
        user_id_str,
        slide_index,
        instr,
        credit_cost,
        EWRP_SLIDE_TEXT_REGEN_TYPE_KEY,
    )

    return await ewrp_build_status_response(job_id, job)
