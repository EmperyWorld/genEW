# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# Read-model helpers for EWRP job status (slides preview, PDF token, status DTO) shared by HTTP router and
# companion background workers — workers poll main Postgres instead of user-scoped HTTP to avoid JWT expiry.
# Invariants:
# - Job ownership enforced via ``user_id`` on every fetch; no cross-user reads.
# - PDF download tokens are best-effort Redis; authenticated PDF route remains fallback.
# Related:
# - api/routers/ewrp.py
# - api/ewa_platform/companion/orchestration/companion_presentation_generation.py
# - api/ewa_platform/companion/jobs/presentation_run_reconcile.py
# ---

from __future__ import annotations

import logging
import os
import secrets
import uuid
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.database_manager import get_database_manager
from api.models.ewrp import EwrpJob
from api.schemas.ewrp import EwrpStatusResponse
from api.services.ewrp_content_quality import ewrp_content_quality_from_slides
from api.services.ewrp_slide_bullets import normalize_ewrp_slide_bullets

logger = logging.getLogger(__name__)

EWRP_PDF_TOKEN_PREFIX = "ewrp_pdf:"
EWRP_PDF_TOKEN_TTL = 3600


def _ewrp_job_output_dir(job_id: uuid.UUID) -> Path | None:
    base = os.environ.get("GENERATED_FILES_BASE", "").strip()
    if not base:
        return None
    return Path(base) / "generated_files" / "ewrp" / str(job_id)


def _ewrp_slide_image_state(
    *,
    job_id: uuid.UUID,
    slide_index: int,
    image_filename: str | None,
) -> tuple[str | None, bool]:
    out_dir = _ewrp_job_output_dir(job_id)
    cleaned = image_filename.strip() if isinstance(image_filename, str) and image_filename.strip() else None
    if out_dir is None:
        return cleaned, False

    if cleaned and (out_dir / cleaned).is_file():
        return cleaned, True

    fallback = f"slide_{slide_index + 1}.png"
    if (out_dir / fallback).is_file():
        return fallback, True
    return cleaned, False


async def ewrp_get_or_create_pdf_download_token(job_id: uuid.UUID) -> str | None:
    """Short-lived PDF download token in Redis; best-effort — returns None when Redis unavailable."""

    try:
        manager = await get_database_manager()
        redis = await manager.get_redis_client()
        if not redis:
            return None
        key = f"{EWRP_PDF_TOKEN_PREFIX}{job_id}"
        token = await redis.get(key)
        if not token:
            token = secrets.token_urlsafe(32)
            await redis.setex(key, EWRP_PDF_TOKEN_TTL, token)
        return token.decode() if isinstance(token, bytes) else token
    except Exception as exc:  # noqa: BLE001 — PDF still served via authenticated path
        logger.debug(
            "EWRP PDF download token redis skipped job_id=%s err=%s",
            job_id,
            exc,
            exc_info=True,
        )
        return None


async def ewrp_best_effort_delete_pdf_token(job_id: uuid.UUID) -> None:
    """Remove PDF download token on job delete; must not block DB row removal."""

    try:
        manager = await get_database_manager()
        redis = await manager.get_redis_client()
        if redis:
            await redis.delete(f"{EWRP_PDF_TOKEN_PREFIX}{job_id}")
    except Exception as exc:  # noqa: BLE001
        logger.debug(
            "EWRP PDF token delete skipped job_id=%s err=%s",
            job_id,
            exc,
            exc_info=True,
        )


def ewrp_slides_preview_from_job(job: EwrpJob) -> list[dict[str, Any]] | None:
    """Lightweight slide preview for UI and companion result payloads."""

    if not job.slides_json:
        return None
    try:
        previews: list[dict[str, Any]] = []
        job_id = uuid.UUID(str(job.id))
        for idx, s in enumerate(job.slides_json):
            if not isinstance(s, dict):
                continue
            image_filename, image_ready = _ewrp_slide_image_state(
                job_id=job_id,
                slide_index=idx,
                image_filename=s.get("image_filename"),
            )
            previews.append(
                {
                    "title": s.get("title") or "",
                    "bullets": normalize_ewrp_slide_bullets(s),
                    "image_filename": image_filename,
                    "image_ready": image_ready,
                    "image_prompt": s.get("image_prompt"),
                    "layout": (s.get("layout") or s.get("slide_layout") or None),
                }
            )
        return previews
    except Exception as exc:
        logger.debug(
            "EWRP slides preview parse failed job_id=%s err=%s",
            getattr(job, "id", "-"),
            exc,
            exc_info=True,
        )
        return None


async def ewrp_build_status_response(job_id: uuid.UUID, job: EwrpJob) -> EwrpStatusResponse:
    """Build public EWRP status DTO from a loaded job row."""

    pdf_url = None
    pdf_download_token = None
    if job.status == "completed" and job.pdf_path:
        pdf_url = f"/api/v1/ewrp/{job_id}/pdf"
        pdf_download_token = await ewrp_get_or_create_pdf_download_token(job_id)

    slides_preview = ewrp_slides_preview_from_job(job)

    slides_json = job.slides_json if isinstance(job.slides_json, list) else None
    recorded_source: str | None = None
    if slides_json:
        for row in slides_json:
            if isinstance(row, dict) and row.get("content_source"):
                recorded_source = str(row["content_source"])
                break
    content_quality, content_warning = ewrp_content_quality_from_slides(
        slides_json,
        topic=job.topic,
        recorded_source=recorded_source,
    )

    return EwrpStatusResponse(
        id=job.id,
        status=job.status or "queued",
        progress=job.progress or 0,
        error_message=job.error_message,
        content_quality=content_quality,
        content_warning=content_warning,
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


async def fetch_ewrp_job_for_user(
    db: AsyncSession,
    *,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> EwrpJob | None:
    """Load one EWRP job owned by ``user_id``."""

    stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def load_ewrp_status_dict_for_user(
    *,
    job_id: str,
    principal_id: str,
) -> dict[str, Any] | None:
    """Load EWRP status via main Postgres for companion mirror (no user JWT on poll loop)."""

    jid_raw = str(job_id or "").strip()
    pid_raw = str(principal_id or "").strip()
    if not jid_raw or not pid_raw:
        return None
    try:
        jid = uuid.UUID(jid_raw)
        uid = uuid.UUID(pid_raw)
    except ValueError:
        return None

    manager = await get_database_manager()
    async with manager.get_postgres_session() as db:
        job = await fetch_ewrp_job_for_user(db, job_id=jid, user_id=uid)
        if job is None:
            return None
        resp = await ewrp_build_status_response(jid, job)
        return resp.model_dump(mode="json")


def build_companion_presentation_result_payload(
    status_payload: Mapping[str, Any],
    *,
    ewrp_job_id: str,
    title: str,
    topic: str,
    num_slides: int,
    presentation_theme: str,
) -> dict[str, Any]:
    """Map EWRP status dict into companion task-run ``result_payload``."""

    slides_raw = status_payload.get("slides")
    slides = slides_raw if isinstance(slides_raw, list) else []
    return {
        "ewrp_job_id": ewrp_job_id,
        "title": str(status_payload.get("title") or title),
        "topic": str(status_payload.get("topic") or topic),
        "num_slides": int(status_payload.get("num_slides") or num_slides or 0),
        "slides_count": len(slides) or int(status_payload.get("num_slides") or num_slides or 0),
        "presentation_theme": str(status_payload.get("presentation_theme") or presentation_theme),
        "pdf_url": str(status_payload.get("pdf_url") or f"/api/v1/ewrp/{ewrp_job_id}/pdf"),
        "pdf_download_token": str(status_payload.get("pdf_download_token") or ""),
        "status": "completed",
        "progress": int(status_payload.get("progress") or 100),
        "slides_preview": [
            {
                "title": str(slide.get("title") or "")[:240],
                "bullets": [str(b)[:240] for b in (slide.get("bullets") or [])[:3]]
                if isinstance(slide, Mapping)
                else [],
            }
            for slide in slides[:5]
            if isinstance(slide, Mapping)
        ],
    }


__all__ = (
    "EWRP_PDF_TOKEN_PREFIX",
    "EWRP_PDF_TOKEN_TTL",
    "build_companion_presentation_result_payload",
    "ewrp_best_effort_delete_pdf_token",
    "ewrp_build_status_response",
    "ewrp_get_or_create_pdf_download_token",
    "ewrp_slides_preview_from_job",
    "fetch_ewrp_job_for_user",
    "load_ewrp_status_dict_for_user",
)
