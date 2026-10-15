# ---
# EliteEW · Empery World
# https://eliteew.ru
# Author: po&T <keysray70@gmail.com>
# ---
# Purpose:
# EWRP pipeline: Llama structured slides → UGS/ComfyUI images → HTML → PDF; image-prompt via chat API.
# Invariants:
# - Slide JSON parsing degrades visibly (`content_source`, status `content_quality`) instead of silent template text.
# - Slide images use 01_top / z-image-turbo at native 1024×1024; scrub text-bait subjects + slide no-text clause before Comfy.
# Related:
# - documentation/product/EWRP-REVOLUTIONARY-PRESENTATIONS.md
# ---

"""
EWRP — EliteEW Revolutionary Presentations.

Pipeline: Llama (content) → UGS (images) → landing HTML → Playwright (screenshot per slide) → PDF.
Does not touch the classic Reveal.js presentation flow.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
import uuid
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import aiohttp  # type: ignore[import-untyped]
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from api.core.database_manager import get_database_manager
from api.core.unified_config import unified_settings
from api.models.database_models import GenerationProvider
from api.models.ewrp import EwrpJob
from api.schemas.notifications import NotificationCreate, NotificationPriority, NotificationType
from api.schemas.unified_content import ContentCreate, ContentType, Visibility
from api.services.ewrp_content_quality import (
    EWRP_CONTENT_SOURCE_TEMPLATE_FALLBACK,
)
from api.services.ewrp_prompt_utils import (
    ensure_ewrp_slide_no_text_clause as _ensure_ewrp_slide_no_text_clause,
)
from api.services.ewrp_prompt_utils import (
    ewrp_image_prompt_is_low_quality as _ewrp_image_prompt_is_low_quality,
)
from api.services.ewrp_prompt_utils import (
    sanitize_ewrp_raw_image_prompt as _sanitize_ewrp_raw_image_prompt,
)
from api.services.ewrp_prompt_utils import (
    scrub_ewrp_text_bait_subjects as _scrub_ewrp_text_bait_subjects,
)
from api.services.ewrp_slide_bullets import normalize_ewrp_slide_bullets
from api.services.ewrp_templates import (
    build_ewrp_html,
    normalize_ewrp_layout_key,
    normalize_presentation_theme,
    presentation_theme_content_hint,
)
from api.services.notification_service import get_notification_service
from api.services.presentation_content_generator_service import (
    PresentationContentGeneratorService,
    PresentationGenerationConfig,
)
from api.services.ugs.unified_generation_service import UnifiedGenerationService
from api.utils.json_safe import truncate_for_log
from api.utils.llama_keep_alive import llama_keep_alive_from_settings
from api.utils.llm_json_extract import (
    salvage_text_from_llama_server_error,
    strip_llm_channel_markup,
    strip_llm_thinking_prefix,
)
from api.utils.llm_openai_compat_http import (
    aiohttp_compat_chat_completion_json,
    aiohttp_compat_generate_json,
)
from api.utils.llm_wall_clock_context import llm_wall_clock_system_section

logger = logging.getLogger(__name__)

# ComfyUI z-image-turbo graph (EliteEW/comfyui/01_top.json): sampler params live in the template.
COMFYUI_EWRP_WORKFLOW = "01_top.json"
# Must match 01_top KSampler (turbo). Do not send SDXL-style steps=20/cfg=7 — they are ignored or harmful.
# Native z-image latent is 1024×1024; non-native WxH often yields glitch / pseudo-text garbage.
EWRP_COMFY_IMAGE_WIDTH = 1024
EWRP_COMFY_IMAGE_HEIGHT = 1024
EWRP_COMFY_IMAGE_STEPS = 4
EWRP_COMFY_IMAGE_CFG = 1.0

# Default negative prompt for ComfyUI EWRP workflow: avoid artifacts and wrong style
DEFAULT_NEGATIVE_PROMPT = (
    "blurry, low quality, distorted, watermark, text, logo, signature, ugly,"
    " pencil sketch, pencil drawing, cartoon, anime, portrait, close-up face,"
    " woman face, girl face, realistic face, deformed, bad anatomy, extra limbs"
)

# UGS get_status polling for image_generation_comfyui: avoid 2s×60 fixed hits per slide.
EWRP_UGS_IMAGE_POLL_DEADLINE_SEC = 240.0
EWRP_UGS_IMAGE_POLL_FIRST_SLEEP_SEC = 2.0
EWRP_UGS_IMAGE_POLL_MAX_SLEEP_SEC = 10.0
EWRP_UGS_IMAGE_POLL_BACKOFF_MULT = 1.45

# Параллельная генерация картинок слайдов (ограничение нагрузки на UGS / ComfyUI).
EWRP_PARALLEL_SLIDE_IMAGES = 2

# UGS: при полном слоте concurrent (часто 5) последовательные вызовы generate() для слайдов
# получают ValueError — ждём освобождения слота с backoff.
EWRP_UGS_CONCURRENT_RETRY_MAX_ATTEMPTS = 48
EWRP_UGS_CONCURRENT_RETRY_BASE_SLEEP_SEC = 1.25
EWRP_UGS_CONCURRENT_RETRY_MAX_SLEEP_SEC = 22.0


def _assign_ewrp_slides_json(job: EwrpJob, slides: list[dict[str, Any]]) -> None:
    """Assign slide JSONB through a fresh object and mark it dirty for SQLAlchemy."""

    job.slides_json = deepcopy(slides)  # type: ignore[assignment]
    flag_modified(job, "slides_json")


# Английские визуальные сцены без транслитерации (fallback, ротация по номеру слайда).
_EWRP_STOCK_VISUAL_ENGLISH: tuple[str, ...] = (
    "wide angle modern gym interior, soft neon rim light, polished floor, empty space, evening mood",
    "abstract data visualization, floating charts, deep blue gradient, glass and light, no text",
    "sleek corporate lobby, glass walls, warm sunlight, minimalist furniture, depth of field",
    "futuristic wellness space, curved architecture, soft volumetric light, calm atmosphere",
    "isometric city skyline at dusk, glowing windows, aerial perspective, cinematic haze",
    "macro abstract metal texture, brushed steel, cool highlights, studio lighting",
    "open plan office panorama, plants, natural wood, soft daylight, uncluttered",
    "abstract network nodes and light trails, dark background, tech editorial style",
)


def _is_ugs_concurrent_limit_error(exc: BaseException) -> bool:
    return "concurrent requests limit exceeded" in str(exc).lower()


async def _ewrp_generate_slide_image_with_retry(
    ugs: UnifiedGenerationService,
    *,
    user_id: uuid.UUID,
    input_data: dict[str, Any],
    slide_index: int,
) -> dict[str, Any]:
    """Вызов ugs.generate для картинки слайда; повтор при исчерпании concurrent-слотов UGS."""
    sleep_s = EWRP_UGS_CONCURRENT_RETRY_BASE_SLEEP_SEC
    last_exc: BaseException | None = None
    for attempt in range(EWRP_UGS_CONCURRENT_RETRY_MAX_ATTEMPTS):
        try:
            if attempt > 0:
                await asyncio.sleep(sleep_s)
                sleep_s = min(sleep_s * 1.35, EWRP_UGS_CONCURRENT_RETRY_MAX_SLEEP_SEC)
            if attempt == 1:
                try:
                    await ugs.billing_service.release_stale_requests(str(user_id), max_age_minutes=5)
                except Exception:
                    logger.debug("EWRP release_stale_requests before slide retry", exc_info=True)
            return await ugs.generate(
                user_id=str(user_id),
                type_key="image_generation_comfyui",
                input_data=input_data,
                priority=3,
                skip_queue=True,
            )
        except ValueError as e:
            if _is_ugs_concurrent_limit_error(e):
                last_exc = e
                logger.info(
                    "EWRP slide %s: UGS concurrent slot busy (attempt %s/%s): %s",
                    slide_index + 1,
                    attempt + 1,
                    EWRP_UGS_CONCURRENT_RETRY_MAX_ATTEMPTS,
                    e,
                )
                continue
            raise
    msg = (
        f"EWRP slide {slide_index + 1}: UGS concurrent limit persists after "
        f"{EWRP_UGS_CONCURRENT_RETRY_MAX_ATTEMPTS} attempts"
    )
    raise RuntimeError(msg) from last_exc


def _ensure_english_prompt(raw: str) -> str:
    """Ensure prompt has no Cyrillic before sending to ComfyUI; return safe English fallback if needed."""
    if not raw or not any("\u0400" <= c <= "\u04ff" for c in raw):
        return (raw or "").strip()
    return (
        "masterpiece, best quality, 8k, professional conceptual illustration,"
        " presentation slide style, soft lighting, no text, no people"
    )


def _prompt_for_4k_workflow(raw_prompt: str, *, for_slide: bool = True) -> str:
    """
    Format prompt for ComfyUI EWRP workflow (01_top.json / SD3-style): quality tags + composition.
    Scrubs text-bait subjects (sign/blueprint/dashboard/…) then forces a slide anti-text clause.
    """
    p = _sanitize_ewrp_raw_image_prompt(_ensure_english_prompt(raw_prompt or ""))
    p = _scrub_ewrp_text_bait_subjects(p)
    if not p or _ewrp_image_prompt_is_low_quality(p):
        return _ensure_ewrp_slide_no_text_clause(
            "professional editorial illustration, soft cinematic light, clean composition,"
            " abstract presentation visual, depth and atmosphere"
        )
    lower = p.lower()
    has_quality = any(
        tag in lower
        for tag in (
            "masterpiece",
            "best quality",
            "8k",
            "photorealistic",
            "cinematic",
            "professional",
            "editorial",
            "illustration",
        )
    )
    base = p if has_quality else f"professional editorial illustration, cinematic lighting, {p}"
    if for_slide:
        return _ensure_ewrp_slide_no_text_clause(base)
    return base


def _safe_image_prompt(
    slide_title: str,
    topic: str = "",
    slide_index: int = 0,
    first_bullet: str | None = None,
) -> str:
    """English-only prompt for ComfyUI без транслитерации RU→LAT (она давала «Slayd / Fitnes-klub»).
    Если тема/заголовок не ASCII — ротируем готовые английские визуальные сцены + короткий ASCII-топик при наличии.
    """
    title_clean = (slide_title or "").strip()
    topic_clean = (topic or "").strip()[:80]
    topic_ascii = bool(topic_clean and not any("\u0400" <= c <= "\u04ff" for c in topic_clean))
    title_ascii = bool(title_clean and not any("\u0400" <= c <= "\u04ff" for c in title_clean))

    stock = _EWRP_STOCK_VISUAL_ENGLISH[slide_index % len(_EWRP_STOCK_VISUAL_ENGLISH)]

    if topic_ascii:
        return (
            f"professional editorial illustration, visual theme: {topic_clean[:60]}, "
            f"{stock}, consistent style, no text, no people, no watermark"
        )
    if title_ascii and len(title_clean) >= 3:
        return (
            f"professional editorial illustration, subject hint: {title_clean[:70]}, "
            f"{stock}, soft cinematic light, no text, no people, no watermark"
        )
    return (
        f"professional editorial illustration, {stock}, "
        "abstract conceptual mood, depth, no text, no people, no watermark"
    )


def _extract_one_line_english_from_llama(data: dict[str, Any]) -> str:
    """
    Extract a clean one-line English answer from Llama /api/generate response.

    Вариант A (исторический, под «простые» модели без thinking):

        raw = (data.get("response") or "").strip()

    Такой подход хорошо работал, когда модель писала только финальный ответ
    в поле response и не добавляла многострочный план размышлений.

    Вариант B (актуальный, под «думающие» модели с полями content/thinking):

    - Сначала пытаемся взять message.content (OpenAI-совместимые модели).
    - Если его нет, берём поле response.
    - Если response содержит и «Thinking Process», и финальный ответ,
      выдираем последнюю непустую строку и обрезаем приставки вроде
      "Final answer:" / "Ответ:".
    - Игнорируем поля thinking/plan/reasoning как внутренний монолог.
    """
    # 1) OpenAI-совместимые модели: message.content
    message = data.get("message") or {}
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        text = strip_llm_channel_markup(strip_llm_thinking_prefix(content.strip()))
    else:
        # 2) Классический /api/generate: поле response
        resp = data.get("response")
        if not isinstance(resp, str) or not resp.strip():
            return ""
        raw = resp.strip()
        # Разделяем на строки и берём последнюю «содержательную»
        lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        if not lines:
            return ""
        last = lines[-1]
        lowered = last.lower()
        for prefix in ("final answer:", "final:", "ответ:", "answer:"):
            if lowered.startswith(prefix):
                last = last[len(prefix) :].lstrip()
                break
        text = last

    text = strip_llm_channel_markup(strip_llm_thinking_prefix(text))
    if any("\u0400" <= c <= "\u04ff" for c in text):
        return ""
    cleaned = _sanitize_ewrp_raw_image_prompt(text.replace("\n", " ").strip())
    if _ewrp_image_prompt_is_low_quality(cleaned):
        return ""
    return cleaned[:400]


def _provider_to_url_model(p: GenerationProvider, fallback_url: str, fallback_model: str) -> tuple[str, str]:
    url = (p.base_url or "").strip().rstrip("/") or fallback_url
    cfg = p.config_json if isinstance(p.config_json, dict) else {}
    model = (cfg.get("default_model") or "").strip() or fallback_model
    return (url, model)


async def _resolve_primary_llama(db: AsyncSession) -> tuple[str, str, list[tuple[str, str]]]:
    """
    Resolve primary Llama (url, model) and fallback list from UGS generation_providers.
    Returns (primary_url, primary_model, [(url, model), ...] for fallbacks).
    On 404 / model not found, EWRP should try fallbacks in order.
    """
    fallback_url = unified_settings.llama_url or "http://stack2-llama-chat:8080"
    fallback_model = unified_settings.default_ai_model
    empty: list[tuple[str, str]] = []
    try:
        result = await db.execute(
            select(GenerationProvider).where(
                GenerationProvider.provider_type.in_(("llama", "llama")),
                GenerationProvider.enabled == True,  # noqa: E712
            )
        )
        llama_providers = list(result.scalars().all())
        if not llama_providers:
            return (fallback_url, fallback_model, empty)

        result_all = await db.execute(select(GenerationProvider))
        all_providers = result_all.scalars().all()
        primary_names: set[str] = set()
        for p in all_providers:
            for name in p.fallback_for or []:
                primary_names.add(name)

        primaries = [p for p in llama_providers if p.provider_name in primary_names]
        candidates = primaries if primaries else llama_providers
        candidates.sort(key=lambda p: (float(p.cost_per_request or 0), p.provider_name or ""))
        chosen = candidates[0]
        primary_url, primary_model = _provider_to_url_model(chosen, fallback_url, fallback_model)

        # Fallbacks: providers that list chosen.provider_name in their fallback_for (same as UGS)
        fallback_providers = [
            p
            for p in llama_providers
            if p.provider_name != chosen.provider_name and (chosen.provider_name in (p.fallback_for or []))
        ]
        fallback_providers.sort(key=lambda p: (float(p.cost_per_request or 0), p.provider_name or ""))
        fallback_list = [_provider_to_url_model(p, fallback_url, fallback_model) for p in fallback_providers]

        return (primary_url, primary_model, fallback_list)
    except Exception as e:
        logger.warning("EWRP: could not resolve primary Llama from UGS: %s", e)
    return (fallback_url, fallback_model, empty)


class EwrpService:
    """Generate EWRP: content → images → HTML → screenshots → PDF."""

    @staticmethod
    def _decode_ugs_b64_image(maybe_b64: str | None) -> bytes | None:
        """Decode base64 image payload from UGS; None if empty or truncated/sanitized."""
        if not maybe_b64 or not isinstance(maybe_b64, str):
            return None
        s = maybe_b64.strip()
        if s.endswith("...TRUNCATED..."):
            return None
        if s.startswith("data:image"):
            parts = s.split(",", 1)
            s = parts[1] if len(parts) == 2 else s
        try:
            return base64.b64decode(s, validate=False)
        except Exception as exc:
            logger.debug("[STEP] ewrp_ugs_b64_decode_skip err=%s", exc)
            return None

    async def _load_ewrp_unified_blob(self, content_id: uuid.UUID) -> bytes | None:
        """
        Read image bytes from unified_content by id (server-side EWRP).

        Avoid ContentStorageService.get_content(owner check): UGS stores content_id in the
        generation row; permission checks have produced empty slides on some accounts.
        Same pattern as queue_handlers._load_unified_content_blob.
        """
        from api.core.database_manager import get_asyncpg_pool  # noqa: PLC0415
        from api.services.unified_content.storage_backends.minio_storage import (  # noqa: PLC0415
            SeaweedFSStorage,
        )

        try:
            pool = await get_asyncpg_pool()
        except Exception as e:
            logger.warning("EWRP: asyncpg pool for unified blob %s: %s", content_id, e)
            return None
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT file_path, storage_backend::text AS storage_backend, file_data
                    FROM unified_content
                    WHERE id = $1 AND deleted_at IS NULL
                    """,
                    content_id,
                )
        except Exception as e:
            logger.warning("EWRP: unified_content query failed for %s: %s", content_id, e)
            return None
        if not row:
            logger.warning("EWRP: unified_content row missing for %s", content_id)
            return None
        sb = (row["storage_backend"] or "postgresql").lower()
        file_data = row["file_data"]
        if sb in ("minio", "seaweedfs") and row["file_path"]:
            try:
                storage = SeaweedFSStorage()
                file_data = await storage.retrieve(row["file_path"] or "", content_id)
            except Exception as e:
                logger.warning("EWRP: object storage retrieve failed %s: %s", content_id, e)
                return None
        if not file_data:
            logger.warning("EWRP: no file bytes for unified content %s (backend=%s)", content_id, sb)
            return None
        return bytes(file_data)

    async def _comfy_ref_bytes_from_ugs(self, ugs: UnifiedGenerationService, first: dict[str, Any]) -> bytes | None:
        """Re-download from Comfy /view when DB has storage_reference but no pixels (persist skipped or expired)."""
        ref = first.get("storage_reference")
        if not isinstance(ref, dict):
            return None
        fn = ref.get("filename")
        if not fn:
            return None
        sub = str(ref.get("subfolder") or "")
        try:
            await ugs.provider_manager.initialize()
            b64 = await ugs.provider_manager.fetch_comfyui_image(str(fn), sub)
        except Exception as e:
            logger.warning("EWRP: ComfyUI re-fetch failed for %s / %s: %s", sub, fn, e)
            return None
        if not b64:
            return None
        return self._decode_ugs_b64_image(b64 if isinstance(b64, str) else str(b64))

    async def _bytes_from_ugs_get_result(
        self,
        res_data: dict[str, Any],
        user_id: uuid.UUID,
        ugs: UnifiedGenerationService,
    ) -> bytes | None:
        """
        Resolve PNG/JPEG bytes from UGS get_result after image_generation_comfyui.

        Order: embedded base64 → unified content by content_id → Comfy /view via storage_reference.
        UGS often persists to unified storage and omits base64 in DB; without content_id fetch slides stay empty.
        """
        gen = res_data.get("result")
        if not isinstance(gen, dict):
            return None
        imgs = gen.get("images")
        if isinstance(imgs, list) and imgs:
            first = imgs[0]
            if isinstance(first, dict):
                b64 = (
                    first.get("data")
                    or first.get("image_data")
                    or (
                        (first.get("data_uri") or "")
                        .replace("data:image/png;base64,", "")
                        .replace("data:image/jpeg;base64,", "")
                        .replace("data:image/webp;base64,", "")
                        .strip()
                    )
                )
                raw = self._decode_ugs_b64_image(b64) if isinstance(b64, str) else None
                if raw:
                    return raw
                cid_raw = first.get("content_id")
                if cid_raw:
                    try:
                        cid = uuid.UUID(str(cid_raw))
                    except (ValueError, TypeError):  # fmt: skip
                        cid = None
                    if cid is not None:
                        unified_raw = await self._load_ewrp_unified_blob(cid)
                        if unified_raw:
                            return unified_raw
                ref_raw = await self._comfy_ref_bytes_from_ugs(ugs, first)
                if ref_raw:
                    return ref_raw
        for key in ("image_data", "data"):
            top = gen.get(key)
            if isinstance(top, str):
                raw = self._decode_ugs_b64_image(top)
                if raw:
                    return raw
        return None

    @staticmethod
    def _ugs_first_image_content_id(res_data: dict[str, Any]) -> uuid.UUID | None:
        gen = res_data.get("result") if isinstance(res_data, dict) else None
        if not isinstance(gen, dict):
            return None
        imgs = gen.get("images")
        if not isinstance(imgs, list) or not imgs:
            return None
        first = imgs[0]
        if not isinstance(first, dict):
            return None
        cid_raw = first.get("content_id")
        if not cid_raw:
            return None
        try:
            return uuid.UUID(str(cid_raw))
        except (ValueError, TypeError):  # fmt: skip
            return None

    async def _assign_images_folder_for_content(self, content_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Put UGS-created slide image into the user desktop Images folder when still uncategorized."""
        from api.core.database_manager import get_asyncpg_pool  # noqa: PLC0415

        try:
            pool = await get_asyncpg_pool()
        except Exception as e:
            logger.warning("EWRP: asyncpg pool for Images folder update %s: %s", content_id, e)
            return
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE unified_content
                    SET folder_item_id = 'images', updated_at = NOW()
                    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
                      AND content_type = 'image'
                      AND (folder_item_id IS NULL OR folder_item_id = '')
                    """,
                    content_id,
                    user_id,
                )
        except Exception as e:
            logger.warning("EWRP: folder_item_id=images update failed for %s: %s", content_id, e)

    async def _sync_ewrp_slide_image_to_user_library(
        self,
        *,
        content_service: Any,
        res_data: dict[str, Any],
        raw_bytes: bytes | None,
        user_id: uuid.UUID,
        job_id: uuid.UUID,
        slide_index: int,
        filename: str,
    ) -> None:
        """
        EWRP saves slide PNGs to disk; UGS may skip unified_content when the worker result has no base64
        (ComfyUI filename-only). Ensure the user sees slide images under the Images folder.
        """
        cid = self._ugs_first_image_content_id(res_data)
        if cid is not None:
            await self._assign_images_folder_for_content(cid, user_id)
            return
        if not content_service or not raw_bytes:
            return
        display_name = f"EWRP {job_id} — слайд {slide_index + 1}"
        content_data = ContentCreate(
            name=display_name[:220],
            description=None,
            content_type=ContentType.IMAGE,
            mime_type="image/png",
            sub_type=None,
            visibility=Visibility.PRIVATE,
            user_id=str(user_id),
            original_filename=filename,
            source_service="ewrp",
            source_id=str(job_id),
            tags=[],
            company_id=None,
            project_id=None,
            title=None,
            word_count=None,
            character_count=None,
            access_level=None,
            is_public=None,
            folder_item_id=None,
            apply_project_desktop_folder=True,
            metadata={"ewrp_job_id": str(job_id), "slide_index": slide_index + 1},
        )
        try:
            await content_service.create_content(
                content_data=content_data,
                file_data=raw_bytes,
                user_id=str(user_id),
            )
        except Exception as e:
            logger.warning(
                "EWRP: failed to persist slide %s to unified content (job %s): %s",
                slide_index + 1,
                job_id,
                e,
            )

    def __init__(self) -> None:
        # URL and model set at pipeline start from UGS primary Llama (see _run_pipeline_steps)
        fallback_url = unified_settings.llama_url or "http://stack2-llama-chat:8080"
        fallback_model = unified_settings.default_ai_model
        self.content_generator = PresentationContentGeneratorService(llama_base_url=fallback_url)
        self._llama_base_url = fallback_url
        self._llama_model = fallback_model
        self._llama_fallbacks: list[tuple[str, str]] = []  # [(url, model), ...] on 404
        self._generated_files_base: str | None = None
        # Переиспользование HTTP-сессии для Llama на время полного пайплайна (см. run_pipeline).
        self._llama_http_session: aiohttp.ClientSession | None = None

    async def _ensure_llama_from_ugs(self, db: AsyncSession) -> None:
        """Bind Llama URL/model from UGS providers (needed for editor auto image prompts)."""
        primary_url, primary_model, fallback_list = await _resolve_primary_llama(db)
        self._llama_base_url = primary_url
        self._llama_model = primary_model
        self._llama_fallbacks = fallback_list

    async def editor_resolve_image_prompt_for_slide(
        self,
        db: AsyncSession,
        slide: dict[str, Any],
        topic: str,
        slide_index: int,
    ) -> str:
        """English image prompt for a slide saved from the editor without an image file (new slide)."""
        await self._ensure_llama_from_ugs(db)
        slide_title = str(slide.get("title") or "")
        bullets = normalize_ewrp_slide_bullets(slide)
        first_bullet = bullets[0] if bullets else ""
        raw_ip = slide.get("image_prompt")
        ip_san = _sanitize_ewrp_raw_image_prompt(str(raw_ip).strip() if raw_ip else "")
        need_llm = (
            not ip_san or any("\u0400" <= c <= "\u04ff" for c in ip_san) or _ewrp_image_prompt_is_low_quality(ip_san)
        )
        if need_llm:
            generated = await self._llama_image_prompt_from_slide(slide_title, first_bullet, topic)
            if generated:
                ip_san = _sanitize_ewrp_raw_image_prompt(generated)
            if not ip_san or _ewrp_image_prompt_is_low_quality(ip_san):
                logger.warning(
                    "[EWRP] editor slide %s: image prompt fallback to stock English",
                    slide_index + 1,
                )
                ip_san = _safe_image_prompt(slide_title, topic, slide_index=slide_index, first_bullet=first_bullet)
        return ip_san

    async def _llama_image_prompt_from_slide(self, slide_title: str, first_bullet: str, topic: str) -> str:
        """Ask Llama for one-line English image prompt; try primary then fallbacks on 404.
        Retries with a strict translate-only prompt if the first attempt returns empty or Cyrillic.
        """
        title_clean = (slide_title or "").strip()[:150]
        bullet_clean = (first_bullet or "").strip()[:200]
        topic_clean = (topic or "").strip()[:100]
        prompt = (
            "You write SHORT English prompts for a text-to-image model (Stable Diffusion style).\n"
            "Context (may be Russian — do NOT copy words from it into the prompt):\n"
            "- Slide title: " + title_clean + "\n"
            "- Main idea: " + bullet_clean + "\n"
            "- Deck topic: " + topic_clean + "\n\n"
            "Output rules:\n"
            "- Exactly ONE line, 14–28 words, English only.\n"
            "- Describe only a visual scene: place, lighting, materials, mood, art style (e.g. editorial 3D, isometric, wide shot).\n"
            "- Forbidden: slide numbers, word 'slide', 'concept:', transliteration of Russian, quotation marks, brand names from the title.\n"
            "- Forbidden subjects that cause fake text in the image: signs, signage, billboards, blueprints with labels, "
            "documents with writing, business cards, newspapers, posters, dashboards, charts/graphs with numbers, UI screens.\n"
            "- Prefer empty surfaces, abstract geometry, nature, architecture without lettering, soft light.\n"
            "- No faces or readable text in the scene description.\n"
        )
        options = {"temperature": 0.25, "num_predict": 220}
        to_try: list[tuple[str, str]] = [(self._llama_base_url, self._llama_model)] + self._llama_fallbacks
        for base_url, model in to_try:
            raw = await self._request_llama_image_prompt(base_url, model, prompt, options)
            if raw:
                return raw
            # Retry with shorter translate-only prompt (often works when model outputs Russian first)
            fallback_prompt = (
                "From the Russian lines below, infer ONE English image prompt (one line, 14–22 words): "
                "setting + lighting + style only. No 'slide', no numbers, no quotes.\n"
                "Title: " + title_clean + "\nPoint: " + bullet_clean[:100]
            )
            raw = await self._request_llama_image_prompt(base_url, model, fallback_prompt, options)
            if raw:
                return raw
        return ""

    async def _request_llama_image_prompt(self, base_url: str, model: str, prompt: str, options: dict[str, Any]) -> str:
        """One-line English image prompt via chat API (thinking off) with completions fallback."""
        timeout = aiohttp.ClientTimeout(total=90)
        chat_opts = dict(options or {})
        chat_opts.setdefault("openai_sidecar_merge_reasoning", True)

        async def _post_chat(session: aiohttp.ClientSession) -> str:
            try:
                result = await aiohttp_compat_chat_completion_json(
                    session,
                    base_url,
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    options=chat_opts,
                    keep_alive=llama_keep_alive_from_settings(),
                    timeout=timeout,
                    chat_template_kwargs={"enable_thinking": False},
                )
            except RuntimeError as e:
                if "404" in str(e):
                    logger.warning(
                        "EWRP LLM 404 (model not found) at %s model=%s, trying fallback",
                        base_url,
                        model,
                    )
                    return ""
                salvaged = salvage_text_from_llama_server_error(str(e))
                if salvaged:
                    cleaned = strip_llm_channel_markup(strip_llm_thinking_prefix(salvaged))
                    return _sanitize_ewrp_raw_image_prompt(cleaned.replace("\n", " ").strip())[:400]
                logger.warning("EWRP LLM image-prompt chat error at %s: %s", base_url, e)
                return ""
            payload = {
                "response": result.get("response", ""),
                "message": result.get("message") or {},
            }
            return _extract_one_line_english_from_llama(payload) or ""

        async def _post_generate(session: aiohttp.ClientSession) -> str:
            try:
                data = await aiohttp_compat_generate_json(
                    session,
                    base_url,
                    model=model,
                    prompt=prompt,
                    system=None,
                    options=options,
                    json_format=False,
                    keep_alive=llama_keep_alive_from_settings(),
                    timeout=timeout,
                )
            except RuntimeError as e:
                if "404" in str(e):
                    logger.warning(
                        "EWRP LLM 404 (model not found) at %s model=%s, trying fallback",
                        base_url,
                        model,
                    )
                    return ""
                salvaged = salvage_text_from_llama_server_error(str(e))
                if salvaged:
                    cleaned = strip_llm_channel_markup(strip_llm_thinking_prefix(salvaged))
                    parsed = _sanitize_ewrp_raw_image_prompt(cleaned.replace("\n", " ").strip())
                    if parsed and not _ewrp_image_prompt_is_low_quality(parsed):
                        return parsed[:400]
                logger.warning("EWRP LLM image-prompt error at %s: %s", base_url, e)
                return ""
            return _extract_one_line_english_from_llama(data) or ""

        try:
            if self._llama_http_session is not None:
                text = await _post_chat(self._llama_http_session)
                if text:
                    return text
                return await _post_generate(self._llama_http_session)
            async with aiohttp.ClientSession() as session:
                text = await _post_chat(session)
                if text:
                    return text
                return await _post_generate(session)
        except Exception as e:
            logger.warning("EWRP Llama image-prompt error at %s: %s", base_url, e)
            return ""

    def _get_base(self) -> str:
        if self._generated_files_base is not None:
            return self._generated_files_base
        base = os.environ.get("GENERATED_FILES_BASE", "").strip()
        if not base:
            raise RuntimeError("GENERATED_FILES_BASE is not set")
        self._generated_files_base = base
        return base

    async def run_pipeline(
        self,
        job_id: uuid.UUID,
        user_id: uuid.UUID,
        title: str,
        topic: str,
        num_slides: int,
        db: AsyncSession,
        *,
        extra_context: str | None = None,
        source_content_id: uuid.UUID | None = None,
        job_entity: EwrpJob | None = None,
    ) -> None:
        """Run full EWRP pipeline and update EwrpJob in DB."""
        base = self._get_base()
        output_dir = Path(base) / "generated_files" / "ewrp" / str(job_id)
        output_dir.mkdir(parents=True, exist_ok=True)

        default_slide_layout: str | None = None
        presentation_theme = "classic"
        use_web_search = False
        web_search_quality: str | None = None
        # Тот же объект задачи, что только что закоммичен в create — тема PDF без второго SELECT.
        if job_entity is not None and job_entity.id == job_id:
            raw_l = getattr(job_entity, "default_slide_layout", None)
            default_slide_layout = normalize_ewrp_layout_key(raw_l if isinstance(raw_l, str) else None)
            pt_raw = getattr(job_entity, "presentation_theme", None)
            presentation_theme = normalize_presentation_theme(pt_raw if isinstance(pt_raw, str) else None)
            use_web_search = bool(getattr(job_entity, "use_web_search", False))
            wsq = getattr(job_entity, "web_search_quality", None)
            web_search_quality = str(wsq).strip() if isinstance(wsq, str) and str(wsq).strip() else None
        else:
            stmt_j = select(EwrpJob).where(EwrpJob.id == job_id)
            rj = await db.execute(stmt_j)
            jrow = rj.scalar_one_or_none()
            if jrow is not None:
                raw_l = getattr(jrow, "default_slide_layout", None)
                default_slide_layout = normalize_ewrp_layout_key(raw_l if isinstance(raw_l, str) else None)
                pt_raw = getattr(jrow, "presentation_theme", None)
                presentation_theme = normalize_presentation_theme(pt_raw if isinstance(pt_raw, str) else None)
                use_web_search = bool(getattr(jrow, "use_web_search", False))
                wsq = getattr(jrow, "web_search_quality", None)
                web_search_quality = str(wsq).strip() if isinstance(wsq, str) and str(wsq).strip() else None

        logger.info(
            "[EWRP][STEP] run_pipeline_start job=%s presentation_theme=%r default_slide_layout=%r web_search_quality=%r",
            job_id,
            presentation_theme,
            default_slide_layout,
            web_search_quality if use_web_search else "off",
        )

        try:
            async with aiohttp.ClientSession() as llama_http:
                self._llama_http_session = llama_http
                try:
                    await self._run_pipeline_steps(
                        job_id=job_id,
                        user_id=user_id,
                        title=title,
                        topic=topic,
                        num_slides=num_slides,
                        output_dir=output_dir,
                        db=db,
                        extra_context=extra_context,
                        source_content_id=source_content_id,
                        default_slide_layout=default_slide_layout,
                        presentation_theme=presentation_theme,
                        use_web_search=use_web_search,
                        web_search_quality=web_search_quality,
                    )
                finally:
                    self._llama_http_session = None
        except Exception as e:
            logger.exception("EWRP pipeline failed for job %s", job_id)
            err_msg = str(e)
            if len(err_msg) > 500:
                err_msg = err_msg[:497] + "..."
            await self._update_status(db, job_id, "failed", 0, error_message=err_msg)
            raise

    async def rebuild_from_slides(self, job: EwrpJob, db: AsyncSession) -> None:
        """Rebuild HTML and PDF from existing slides_json without re-calling Llama/ComfyUI."""
        if not job.slides_json:
            msg = "No slides_json stored for this EWRP job"
            raise RuntimeError(msg)

        base = self._get_base()
        output_dir = Path(base) / "generated_files" / "ewrp" / str(job.id)
        output_dir.mkdir(parents=True, exist_ok=True)

        # 1) Prepare template slides for HTML (restore image_filename from disk if missing)
        template_slides: list[dict[str, Any]] = []
        for i, s in enumerate(job.slides_json):
            if not isinstance(s, dict):
                continue
            img = s.get("image_filename")
            if not img:
                # Old jobs or editor may not have image_filename in JSON; use convention slide_1.png, slide_2.png
                fallback = f"slide_{i + 1}.png"
                if (output_dir / fallback).is_file():
                    img = fallback
            row: dict[str, Any] = {
                "title": str(s.get("title") or ""),
                "bullets": normalize_ewrp_slide_bullets(s),
                "image_filename": img,
            }
            ip = s.get("image_prompt") or s.get("imagePrompt")
            if isinstance(ip, str) and ip.strip():
                row["image_prompt"] = ip.strip()
            lay = s.get("layout") or s.get("slide_layout")
            if isinstance(lay, str) and lay.strip():
                row["layout"] = lay.strip()
            template_slides.append(row)

        pt = normalize_presentation_theme(
            getattr(job, "presentation_theme", None)
            if isinstance(getattr(job, "presentation_theme", None), str)
            else None
        )
        from api.services.ewrp_font_assets import stage_ewrp_fonts  # noqa: PLC0415

        stage_ewrp_fonts(output_dir)
        html_content = build_ewrp_html(job.title, template_slides, presentation_theme=pt)
        html_path = output_dir / "index.html"
        html_path.write_text(html_content, encoding="utf-8")

        # 2) Screenshot each slide via queue-worker browser render sidecar and stitch to PDF
        await self._update_status(db, job.id, "building_pdf", 60)

        screenshot_dir = output_dir / "screenshots"
        await self._capture_ewrp_slide_screenshots(db, job.id, html_path, screenshot_dir)

        await self._update_status(db, job.id, "building_pdf", 88)
        pdf_path = output_dir / "presentation.pdf"
        self._images_to_pdf(sorted(screenshot_dir.glob("page_*.png")), pdf_path)
        await self._update_status(
            db,
            job.id,
            "completed",
            100,
            pdf_path=str(pdf_path),
            html_path=str(html_path),
        )
        logger.info("EWRP job %s rebuilt from slides: %s", job.id, pdf_path)

    async def _load_document_excerpt(
        self,
        db: AsyncSession,
        content_id: uuid.UUID,
        max_chars: int = 8000,
    ) -> str:
        """Load extracted_text from unified_content for use as additional context."""
        try:
            result = await db.execute(
                text("SELECT LEFT(COALESCE(extracted_text, ''), :limit) FROM unified_content WHERE id = :id"),
                {"id": content_id, "limit": max_chars},
            )
            value = result.scalar_one_or_none()
            if not value:
                return ""
            if isinstance(value, bytes):
                try:
                    value = value.decode("utf-8", errors="ignore")
                except Exception as exc:
                    logger.debug("[STEP] ewrp_unified_content_bytes_decode_skip content_id=%s err=%s", content_id, exc)
                    return ""
            return str(value)
        except Exception as e:
            logger.warning("EWRP: failed to load unified_content %s: %s", content_id, e)
            return ""

    async def _run_pipeline_steps(
        self,
        job_id: uuid.UUID,
        user_id: uuid.UUID,
        title: str,
        topic: str,
        num_slides: int,
        output_dir: Path,
        db: AsyncSession,
        *,
        extra_context: str | None = None,
        source_content_id: uuid.UUID | None = None,
        default_slide_layout: str | None = None,
        presentation_theme: str = "classic",
        use_web_search: bool = False,
        web_search_quality: str | None = None,
    ) -> None:
        """Inner pipeline steps; exceptions are caught in run_pipeline to set status=failed."""
        try:
            # 0) Use primary Llama from UGS (URL + model + fallbacks for 404)
            primary_url, primary_model, fallback_list = await _resolve_primary_llama(db)
            self._llama_base_url = primary_url
            self._llama_model = primary_model
            self._llama_fallbacks = fallback_list
            self.content_generator = PresentationContentGeneratorService(llama_base_url=primary_url)
            logger.info(
                "EWRP using primary Llama: %s, model: %s, fallbacks: %s",
                primary_url,
                primary_model,
                len(fallback_list),
            )

            # 1) Generate content (Llama); on 404/model not found try fallback providers
            logger.info("[EWRP][STEP] generating_content_start job=%s", job_id)
            await self._update_status(db, job_id, "generating_content", 5)

            extra_blocks: list[str] = []
            if extra_context:
                extra_blocks.append(
                    "Дополнительные вводные от пользователя (используй как приоритетные ограничения для структуры и тона):\n"
                    + extra_context.strip()
                )

            if source_content_id is not None:
                doc_excerpt = await self._load_document_excerpt(db, source_content_id)
                if doc_excerpt:
                    extra_blocks.append(
                        "Краткая выдержка из выбранного документа пользователя (используй как фактический контент презентации, не выдумывай данные):\n"
                        + doc_excerpt
                    )

            theme_hint = presentation_theme_content_hint(presentation_theme)
            if theme_hint.strip():
                extra_blocks.append(
                    "Требования к тексту с учётом выбранного пользователем визуального стиля итогового PDF:\n"
                    + theme_hint
                )

            from api.services.ewrp_fact_grounding import (
                build_ewrp_fact_grounding_block,
                build_ewrp_web_search_prompt_section,
                ewrp_grounded_llm_temperatures,
            )
            from api.services.marketing_web_search_context import (
                build_ewrp_web_search_queries,
                resolve_marketing_kbsew_context,
                resolve_marketing_web_search_context,
            )
            from api.services.marketing_web_search_quality import (
                normalize_web_search_quality,
                web_search_enabled,
            )

            ws_quality = normalize_web_search_quality(
                web_search_quality,
                use_web_search=use_web_search,
            )
            ws_on = web_search_enabled(ws_quality)
            ws_queries = build_ewrp_web_search_queries(
                topic=topic,
                title=title,
                extra_context=extra_context,
                quality=ws_quality,
            )
            web_block = await resolve_marketing_web_search_context(
                query=topic,
                web_search_quality=ws_quality,
                queries=ws_queries,
                user_id=str(user_id),
                db=db,
                log_prefix="ewrp.web_search",
            )
            kbsew_block = await resolve_marketing_kbsew_context(
                query=topic,
                queries=ws_queries,
                db=db,
            )
            grounding_block = build_ewrp_fact_grounding_block(
                web_search_enabled=ws_on,
                web_block=web_block,
            )
            extra_blocks.append(grounding_block)
            web_section = build_ewrp_web_search_prompt_section(web_block)
            if web_section:
                extra_blocks.append(web_section)
            elif ws_on:
                logger.warning(
                    "[EWRP][STEP] web_search_empty job=%s quality=%s queries=%s",
                    job_id,
                    ws_quality,
                    ws_queries,
                )
            if kbsew_block:
                extra_blocks.append(f"## KBSEW knowledge base\n{kbsew_block}")

            outline_temperature, slide_content_temperature = ewrp_grounded_llm_temperatures(web_search_enabled=ws_on)

            additional_context = (
                llm_wall_clock_system_section()
                + "\n\n"
                + "Презентация для EWRP: каждый слайд будет с картинкой (ComfyUI). "
                "Обязательно заполняй content — 3–7 буллетов на русском. "
                "imagePrompt — только на АНГЛИЙСКОМ, короткое описание картинки для слайда: "
                "концепт, стиль (professional, conceptual, soft lighting), без текста и лиц."
            )
            if extra_blocks:
                additional_context = additional_context + "\n\n" + "\n\n".join(extra_blocks)

            config = PresentationGenerationConfig(
                topic=topic,
                slide_count=num_slides,
                type_key="educational",
                additional_context=additional_context,
                outline_temperature=outline_temperature,
                slide_content_temperature=slide_content_temperature,
            )
            raw_slides: list[dict[str, Any]] = []
            content_source: str | None = None
            last_error: Exception | None = None
            to_try_content: list[tuple[str, str]] = [(primary_url, primary_model)] + fallback_list
            for base_url, model in to_try_content:
                try:
                    self._llama_base_url = base_url
                    self._llama_model = model
                    self.content_generator = PresentationContentGeneratorService(llama_base_url=base_url)
                    gen_result = await self.content_generator.generate_presentation_slides(
                        config=config,
                        model=model,
                    )
                    raw_slides = gen_result.slides
                    content_source = gen_result.content_source
                    if raw_slides:
                        if base_url != primary_url:
                            logger.info("EWRP content generated via fallback Llama: %s, model: %s", base_url, model)
                        break
                except RuntimeError as e:
                    msg = str(e).lower()
                    if "404" in msg or ("model" in msg and "not found" in msg):
                        logger.warning("EWRP primary Llama failed (404/model not found), trying fallback: %s", e)
                        last_error = e
                        continue
                    raise
            if not raw_slides:
                if last_error:
                    raise last_error
                raise RuntimeError("EWRP: Llama returned no slides from any provider")
            if content_source == EWRP_CONTENT_SOURCE_TEMPLATE_FALLBACK:
                logger.warning(
                    "[EWRP][STEP] content_template_fallback job=%s topic=%r slides=%s",
                    job_id,
                    topic,
                    len(raw_slides),
                )
            logger.debug(
                "[EWRP] raw_slides from generator: count=%s source=%s",
                len(raw_slides),
                content_source,
            )
            slides_data: list[dict[str, Any]] = []
            for i, s in enumerate(raw_slides):
                slide_num = s.get("slideNumber") or s.get("slide_number") or (i + 1)
                slide_title = s.get("title") or (title if slide_num == 1 else f"Слайд {i + 1}")
                bullets = normalize_ewrp_slide_bullets(s) if isinstance(s, dict) else []
                if not bullets:
                    bullets = [
                        f"Ключевые аспекты: {slide_title}.",
                        f"Раскрытие темы «{topic[:60]}{'…' if len(topic) > 60 else ''}».",
                    ]
                raw_ip = s.get("imagePrompt") or s.get("image_prompt")
                first_bullet = bullets[0] if bullets else ""
                ip_san = _sanitize_ewrp_raw_image_prompt(str(raw_ip).strip() if raw_ip else "")
                need_llm_prompt = (
                    not ip_san
                    or any("\u0400" <= c <= "\u04ff" for c in ip_san)
                    or _ewrp_image_prompt_is_low_quality(ip_san)
                )
                if need_llm_prompt:
                    generated = await self._llama_image_prompt_from_slide(slide_title, first_bullet, topic)
                    if generated:
                        ip_san = _sanitize_ewrp_raw_image_prompt(generated)
                    if not ip_san or _ewrp_image_prompt_is_low_quality(ip_san):
                        logger.warning(
                            "[EWRP] slide %s: image prompt low quality or empty, using stock English (title=%r)",
                            i + 1,
                            (slide_title or "")[:60],
                        )
                        ip_san = _safe_image_prompt(slide_title, topic, slide_index=i, first_bullet=first_bullet)
                image_prompt = ip_san
                slides_data.append(
                    {
                        "title": slide_title,
                        "bullets": bullets,
                        "image_prompt": image_prompt,
                        "image_path": None,
                        "content_source": s.get("content_source") or content_source,
                    }
                )
            for slide in slides_data:
                slide.setdefault("confidence", 0.6)
            layout_key = normalize_ewrp_layout_key(default_slide_layout)
            if layout_key:
                for idx, slide in enumerate(slides_data):
                    if idx > 0:
                        slide["layout"] = layout_key
            for idx, sd in enumerate(slides_data):
                bullets_preview = truncate_for_log(
                    repr(sd.get("bullets")),
                    max_chars=220,
                )
                logger.info(
                    "[EWRP][STEP] slides_data_ready idx=%s job=%s title=%r bullets_len=%s bullets_preview=%s",
                    idx,
                    job_id,
                    sd["title"],
                    len(sd["bullets"]),
                    bullets_preview,
                )
            # Сохраним слайды в модель и на диск для последующего управления/редакта
            try:
                stmt = select(EwrpJob).where(EwrpJob.id == job_id)
                result = await db.execute(stmt)
                job = result.scalar_one_or_none()
                if job:
                    _assign_ewrp_slides_json(job, slides_data)
                    await db.commit()
            except Exception as e:
                logger.warning("EWRP: failed to persist slides_json for job %s: %s", job_id, e)

            await self._update_status(db, job_id, "generating_content", 15)

            # 2) Generate images (UGS)
            await self._update_status(db, job_id, "generating_images", 20)
            logger.info(
                "[EWRP][STEP] generating_images_start job=%s slides=%s parallel=%s",
                job_id,
                len(slides_data),
                EWRP_PARALLEL_SLIDE_IMAGES,
            )

            # In-app notification: UGS generation started (EWRP job-level)
            try:
                notification_service = get_notification_service()
                await notification_service.send_to_user(
                    user_id,
                    NotificationCreate(
                        type=NotificationType.INFO,
                        title="UGS: генерация изображений запущена",
                        message=f"EWRP: подготовка слайдов (job {job_id}).",
                        priority=NotificationPriority.NORMAL,
                        persistent=False,
                        source="ugs",
                        metadata={"ewrp_job_id": str(job_id)},
                    ),
                )
            except Exception:
                logger.debug("NotificationService: failed to send EWRP UGS start notification", exc_info=True)

            content_service = None
            try:
                from api.routers.unified_content import get_content_service  # noqa: PLC0415

                content_service = await get_content_service()
            except Exception as e:
                logger.warning("EWRP: optional get_content_service failed (UGS queue path still ok): %s", e)

            # Each slide task uses its own AsyncSession for UGS (generate/poll/get_result).
            # Sharing one session across asyncio.gather caused:
            # "This session is provisioning a new connection; concurrent operations are not permitted".
            total_slides = max(len(slides_data), 1)
            sem = asyncio.Semaphore(EWRP_PARALLEL_SLIDE_IMAGES)
            state_lock = asyncio.Lock()
            completed_count: list[int] = [0]
            db_manager = await get_database_manager()

            async def _run_one_slide(idx: int, slide: dict[str, Any]) -> None:
                prompt = _prompt_for_4k_workflow(slide["image_prompt"])
                fn = f"slide_{idx + 1}.png"
                res_data: dict[str, Any] | None = None
                raw_bytes: bytes | None = None
                try:
                    async with sem:
                        try:
                            async with (
                                db_manager.get_postgres_session() as db_slide,
                                UnifiedGenerationService(db_slide, content_service=content_service) as ugs_slide,
                            ):
                                result = await _ewrp_generate_slide_image_with_retry(
                                    ugs_slide,
                                    user_id=user_id,
                                    slide_index=idx,
                                    input_data={
                                        "prompt": prompt,
                                        "width": EWRP_COMFY_IMAGE_WIDTH,
                                        "height": EWRP_COMFY_IMAGE_HEIGHT,
                                        "steps": EWRP_COMFY_IMAGE_STEPS,
                                        "cfg_scale": EWRP_COMFY_IMAGE_CFG,
                                        "negative_prompt": DEFAULT_NEGATIVE_PROMPT,
                                        "workflow_template": COMFYUI_EWRP_WORKFLOW,
                                    },
                                )
                                req_id = result["request_id"]
                                res_data = await self._poll_ugs_image_soft_for_pipeline(ugs_slide, req_id, job_id, idx)
                                if res_data is not None:
                                    raw_bytes = await self._bytes_from_ugs_get_result(res_data, user_id, ugs_slide)
                                    if raw_bytes:
                                        path = output_dir / fn
                                        path.write_bytes(raw_bytes)
                        except Exception as e:
                            logger.warning("EWRP image %s error: %s", idx + 1, e)
                finally:
                    async with state_lock:
                        if raw_bytes and res_data is not None:
                            slide["image_path"] = str(output_dir / fn)
                            slide["image_filename"] = fn
                        if res_data is not None:
                            try:
                                await self._sync_ewrp_slide_image_to_user_library(
                                    content_service=content_service,
                                    res_data=res_data,
                                    raw_bytes=raw_bytes,
                                    user_id=user_id,
                                    job_id=job_id,
                                    slide_index=idx,
                                    filename=fn,
                                )
                            except Exception as sync_e:
                                logger.warning(
                                    "EWRP slide %s library sync: %s",
                                    idx + 1,
                                    sync_e,
                                )
                            if not raw_bytes:
                                r0 = (res_data.get("result") or {}) if isinstance(res_data, dict) else {}
                                imgs = r0.get("images") if isinstance(r0, dict) else None
                                hint = (
                                    list(imgs[0].keys())
                                    if isinstance(imgs, list) and imgs and isinstance(imgs[0], dict)
                                    else None
                                )
                                logger.warning(
                                    "EWRP job %s slide %s: UGS completed but no image bytes (first image keys=%s).",
                                    job_id,
                                    idx + 1,
                                    hint,
                                )
                        completed_count[0] += 1
                        prog = 20 + int((completed_count[0] / total_slides) * 35)
                        await self._update_status(db, job_id, "generating_images", prog)

            await asyncio.gather(
                *(_run_one_slide(i, s) for i, s in enumerate(slides_data)),
                return_exceptions=False,
            )

            await self._update_status(db, job_id, "generating_images", 55)

            # In-app notification: UGS generation for EWRP completed
            try:
                notification_service = get_notification_service()
                await notification_service.send_to_user(
                    user_id,
                    NotificationCreate(
                        type=NotificationType.SUCCESS,
                        title="UGS: генерация изображений завершена",
                        message=f"EWRP: изображения для презентации готовы (job {job_id}).",
                        priority=NotificationPriority.HIGH,
                        persistent=True,
                        source="ugs",
                        metadata={"ewrp_job_id": str(job_id)},
                    ),
                )
            except Exception:
                logger.debug("NotificationService: failed to send EWRP UGS completion notification", exc_info=True)

            # 3) Build HTML and write to output_dir
            # Persist final slides_json (with image_filename) for editor / status preview
            try:
                stmt = select(EwrpJob).where(EwrpJob.id == job_id)
                result = await db.execute(stmt)
                job = result.scalar_one_or_none()
                if job:
                    _assign_ewrp_slides_json(job, slides_data)
                    await db.commit()
            except Exception as e:  # pragma: no cover - safety log
                logger.warning("EWRP: failed to persist final slides_json for job %s: %s", job_id, e)

            template_slides = [
                {
                    "title": s["title"],
                    "bullets": s["bullets"],
                    "image_filename": s.get("image_filename"),
                    "image_prompt": s.get("image_prompt"),
                }
                for s in slides_data
            ]
            # Пишем отдельный JSON-превью рядом с HTML (включая image_prompt для ops/debug/regen).
            try:
                slides_json_path = output_dir / "slides.json"
                slides_json_path.write_text(
                    json.dumps(template_slides, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            except Exception as e:
                logger.warning("EWRP: failed to write slides.json for job %s: %s", job_id, e)
            from api.services.ewrp_font_assets import stage_ewrp_fonts  # noqa: PLC0415

            stage_ewrp_fonts(output_dir)
            html_content = build_ewrp_html(
                title,
                template_slides,
                presentation_theme=presentation_theme,
            )
            html_path = output_dir / "index.html"
            html_path.write_text(html_content, encoding="utf-8")
            logger.info("[EWRP][STEP] html_written job=%s path=%s", job_id, html_path)

            # 4) Screenshot each slide via queue-worker browser render sidecar
            logger.info("[EWRP][STEP] building_pdf_screenshots_start job=%s", job_id)
            await self._update_status(db, job_id, "building_pdf", 60)
            screenshot_dir = output_dir / "screenshots"
            await self._capture_ewrp_slide_screenshots(db, job_id, html_path, screenshot_dir)

            # 5) Stitch screenshots to PDF
            await self._update_status(db, job_id, "building_pdf", 88)
            pdf_path = output_dir / "presentation.pdf"
            logger.info("[EWRP][STEP] building_pdf_stitch job=%s", job_id)
            self._images_to_pdf(sorted(screenshot_dir.glob("page_*.png")), pdf_path)
            await self._update_status(
                db,
                job_id,
                "completed",
                100,
                pdf_path=str(pdf_path),
                html_path=str(html_path),
            )
            logger.info("EWRP job %s completed: %s", job_id, pdf_path)

        except Exception:
            raise

    async def _capture_ewrp_slide_screenshots(
        self,
        db: AsyncSession,
        job_id: uuid.UUID,
        html_path: Path,
        screenshot_dir: Path,
    ) -> list[Path]:
        """Render EWRP slide PNGs through the queue-worker browser sidecar (no local Playwright)."""
        from api.services.rendering.browser_render_facade import screenshot_ewrp_html_slides

        screenshot_dir.mkdir(exist_ok=True)
        for old in screenshot_dir.glob("page_*.png"):
            try:
                old.unlink()
            except OSError:
                logger.warning("EWRP: failed to remove old screenshot %s", old)

        paths = await screenshot_ewrp_html_slides(
            html_path=html_path,
            screenshot_dir=screenshot_dir,
        )
        total = max(len(paths), 1)
        for index in range(len(paths)):
            await self._update_status(
                db,
                job_id,
                "building_pdf",
                60 + int((index / total) * 25),
            )
        return paths

    def _images_to_pdf(self, image_paths: list[Path], pdf_path: Path) -> None:
        """Write a PDF with one page per image (reportlab)."""
        from PIL import Image  # type: ignore[import-not-found]
        from reportlab.lib.pagesizes import A4, landscape  # type: ignore[import-not-found]
        from reportlab.pdfgen import canvas  # type: ignore[import-not-found]

        if not image_paths:
            raise ValueError("No images to convert to PDF")
        page_w, page_h = landscape(A4)
        c = canvas.Canvas(str(pdf_path), pagesize=landscape(A4))
        for path in image_paths:
            img = Image.open(path)
            iw, ih = img.size
            scale = min(page_w / iw, page_h / ih)
            w, h = iw * scale, ih * scale
            x, y = (page_w - w) / 2, (page_h - h) / 2
            c.drawImage(str(path), x, y, width=w, height=h)
            c.showPage()
        c.save()

    async def _poll_ugs_until_image_ready(
        self,
        ugs: UnifiedGenerationService,
        user_id: uuid.UUID,
        req_id: str,
        job_id: uuid.UUID,
        slide_index: int,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + EWRP_UGS_IMAGE_POLL_DEADLINE_SEC
        next_sleep = 0.0
        while time.monotonic() < deadline:
            if next_sleep > 0:
                await asyncio.sleep(next_sleep)
            status_res = await ugs.get_status(req_id)
            pub = str(status_res.get("status") or "").lower()
            if pub in ("success", "completed"):
                return await ugs.get_result(req_id)
            if status_res.get("status") == "failed":
                err = status_res.get("error_message") or "UGS failed"
                msg = f"UGS image generation failed: {err}"
                raise RuntimeError(msg)
            if next_sleep == 0.0:
                next_sleep = EWRP_UGS_IMAGE_POLL_FIRST_SLEEP_SEC
            else:
                next_sleep = min(
                    next_sleep * EWRP_UGS_IMAGE_POLL_BACKOFF_MULT,
                    EWRP_UGS_IMAGE_POLL_MAX_SLEEP_SEC,
                )
        msg = f"EWRP job {job_id} slide {slide_index + 1}: UGS image poll timeout"
        raise RuntimeError(msg)

    async def _poll_ugs_image_soft_for_pipeline(
        self,
        ugs: UnifiedGenerationService,
        req_id: str,
        job_id: uuid.UUID,
        slide_index: int,
    ) -> dict[str, Any] | None:
        """
        Опрос UGS до успеха, явного failed или таймаута. Возвращает res_data или None.

        Мягкая политика для полного пайплайна: при None слайд может остаться без картинки,
        задача всё равно может завершиться completed. Для перегенерации одного слайда
        используйте _poll_ugs_until_image_ready (строго, с исключением).
        """
        deadline = time.monotonic() + EWRP_UGS_IMAGE_POLL_DEADLINE_SEC
        next_sleep = 0.0
        while time.monotonic() < deadline:
            if next_sleep > 0:
                await asyncio.sleep(next_sleep)
            status_res = await ugs.get_status(req_id)
            pub = str(status_res.get("status") or "").lower()
            if pub in ("success", "completed"):
                return await ugs.get_result(req_id)
            if status_res.get("status") == "failed":
                logger.warning(
                    "EWRP job %s slide %s: UGS image failed: %s",
                    job_id,
                    slide_index + 1,
                    status_res.get("error_message"),
                )
                return None
            if next_sleep == 0.0:
                next_sleep = EWRP_UGS_IMAGE_POLL_FIRST_SLEEP_SEC
            else:
                next_sleep = min(
                    next_sleep * EWRP_UGS_IMAGE_POLL_BACKOFF_MULT,
                    EWRP_UGS_IMAGE_POLL_MAX_SLEEP_SEC,
                )
        logger.warning(
            "EWRP job %s slide %s: UGS image poll timeout",
            job_id,
            slide_index + 1,
        )
        return None

    async def regenerate_slide_image_workflow(
        self,
        db: AsyncSession,
        job_id: uuid.UUID,
        user_id: uuid.UUID,
        slide_index: int,
        prompt: str,
        *,
        skip_final_rebuild: bool = False,
    ) -> None:
        logger.info(
            "[STEP] EWRP regenerate_slide_image start job=%s slide=%s",
            job_id,
            slide_index + 1,
        )
        stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()
        if not job:
            msg = "EWRP job not found"
            raise RuntimeError(msg)
        slides_raw = job.slides_json or []
        if not isinstance(slides_raw, list) or slide_index < 0 or slide_index >= len(slides_raw):
            msg = "Invalid slide index"
            raise RuntimeError(msg)
        base = self._get_base()
        output_dir = Path(base) / "generated_files" / "ewrp" / str(job_id)
        output_dir.mkdir(parents=True, exist_ok=True)

        content_service = None
        try:
            from api.routers.unified_content import get_content_service  # noqa: PLC0415

            content_service = await get_content_service()
        except Exception:
            logger.debug("EWRP slide regen: optional content_service", exc_info=True)

        formatted = _prompt_for_4k_workflow(prompt)
        await self._update_status(db, job_id, "generating_images", 40)

        async with UnifiedGenerationService(db, content_service=content_service) as ugs:
            gen_result = await _ewrp_generate_slide_image_with_retry(
                ugs,
                user_id=user_id,
                slide_index=slide_index,
                input_data={
                    "prompt": formatted,
                    "width": EWRP_COMFY_IMAGE_WIDTH,
                    "height": EWRP_COMFY_IMAGE_HEIGHT,
                    "steps": EWRP_COMFY_IMAGE_STEPS,
                    "cfg_scale": EWRP_COMFY_IMAGE_CFG,
                    "negative_prompt": DEFAULT_NEGATIVE_PROMPT,
                    "workflow_template": COMFYUI_EWRP_WORKFLOW,
                },
            )
            req_id = gen_result["request_id"]
            res_data = await self._poll_ugs_until_image_ready(ugs, user_id, req_id, job_id, slide_index)
            raw_bytes = await self._bytes_from_ugs_get_result(res_data, user_id, ugs)
            fn = f"slide_{slide_index + 1}.png"
            if not raw_bytes:
                msg = "UGS returned no image bytes for slide regeneration"
                raise RuntimeError(msg)
            path = output_dir / fn
            path.write_bytes(raw_bytes)
            await self._sync_ewrp_slide_image_to_user_library(
                content_service=content_service,
                res_data=res_data,
                raw_bytes=raw_bytes,
                user_id=user_id,
                job_id=job_id,
                slide_index=slide_index,
                filename=fn,
            )

        slides = [dict(s) if isinstance(s, dict) else {} for s in slides_raw]
        cur = slides[slide_index]
        cur["title"] = cur.get("title") or ""
        cur["bullets"] = normalize_ewrp_slide_bullets(cur)
        cur["image_filename"] = fn
        cur["image_prompt"] = prompt.strip()[:2000]
        slides[slide_index] = cur
        _assign_ewrp_slides_json(job, slides)
        await db.commit()
        await db.refresh(job)

        if not skip_final_rebuild:
            await self.rebuild_from_slides(job, db)
        logger.info("[STEP] EWRP regenerate_slide_image done job=%s", job_id)

    async def _llm_json_rewrite_slide(
        self,
        topic: str,
        slide_title: str,
        bullets: list[str],
        instruction: str | None,
    ) -> dict[str, Any]:
        instr = (instruction or "").strip()
        body = json.dumps(
            {"title": slide_title, "bullets": bullets},
            ensure_ascii=False,
        )
        prompt = (
            "You are editing ONE presentation slide. Output a JSON object with keys:\n"
            '"title" (string, Russian),\n'
            '"bullets" (array of strings, Russian, 2 to 5 short items),\n'
            '"image_prompt" (string, English only, for AI image generation, no text on image).\n'
            f"Presentation topic: {topic[:500]}\n"
            f"Current slide JSON: {body}\n"
        )
        if instr:
            prompt += f"User instruction: {instr}\n"
        async with aiohttp.ClientSession() as session:
            data = await aiohttp_compat_generate_json(
                session,
                self._llama_base_url,
                model=self._llama_model,
                prompt=prompt,
                system=None,
                options={"temperature": 0.35, "num_predict": 900},
                json_format=True,
                keep_alive=llama_keep_alive_from_settings(),
                timeout=aiohttp.ClientTimeout(total=120),
            )
        text = (data.get("response") or "").strip()
        if "```" in text:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                text = text[start:end]
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            msg = f"Invalid JSON from text model: {e}"
            raise RuntimeError(msg) from e

    async def regenerate_slide_text_workflow(
        self,
        db: AsyncSession,
        job_id: uuid.UUID,
        user_id: uuid.UUID,
        slide_index: int,
        instruction: str | None,
    ) -> None:
        logger.info(
            "[STEP] EWRP regenerate_slide_text start job=%s slide=%s",
            job_id,
            slide_index + 1,
        )
        stmt = select(EwrpJob).where(EwrpJob.id == job_id, EwrpJob.user_id == user_id)
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()
        if not job:
            msg = "EWRP job not found"
            raise RuntimeError(msg)
        slides_raw = job.slides_json or []
        if not isinstance(slides_raw, list) or slide_index < 0 or slide_index >= len(slides_raw):
            msg = "Invalid slide index"
            raise RuntimeError(msg)
        cur = slides_raw[slide_index]
        if not isinstance(cur, dict):
            msg = "Invalid slide data"
            raise RuntimeError(msg)
        title = str(cur.get("title") or "")
        bullets = normalize_ewrp_slide_bullets(cur)
        topic = (job.topic or "").strip()

        await self._update_status(db, job_id, "generating_content", 35)
        parsed = await self._llm_json_rewrite_slide(topic, title, bullets, instruction)
        new_title = str(parsed.get("title") or title).strip() or title
        new_bullets = parsed.get("bullets")
        if not isinstance(new_bullets, list) or not new_bullets:
            new_bullets = bullets
        else:
            new_bullets = [str(b).strip() for b in new_bullets if str(b).strip()]
        img_prompt = parsed.get("image_prompt")
        img_prompt_s = str(img_prompt).strip()[:2000] if img_prompt else None

        slides = [dict(s) if isinstance(s, dict) else {} for s in slides_raw]
        row = slides[slide_index]
        row["title"] = new_title[:500]
        row["bullets"] = new_bullets[:20]
        if img_prompt_s:
            row["image_prompt"] = img_prompt_s
        slides[slide_index] = row
        _assign_ewrp_slides_json(job, slides)
        await db.commit()
        await db.refresh(job)

        await self.rebuild_from_slides(job, db)
        logger.info("[STEP] EWRP regenerate_slide_text done job=%s", job_id)

    async def _update_status(
        self,
        db: AsyncSession,
        job_id: uuid.UUID,
        status: str,
        progress: int,
        error_message: str | None = None,
        pdf_path: str | None = None,
        html_path: str | None = None,
    ) -> None:
        stmt = select(EwrpJob).where(EwrpJob.id == job_id)
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()
        if job:
            job.status = status  # type: ignore[assignment]
            job.progress = progress  # type: ignore[assignment]
            if error_message is not None:
                job.error_message = error_message  # type: ignore[assignment]
            if pdf_path is not None:
                job.pdf_path = str(pdf_path)  # type: ignore[assignment]
            if html_path is not None:
                job.html_path = str(html_path)  # type: ignore[assignment]
            if status == "completed":
                # Column is TIMESTAMP WITHOUT TIME ZONE — pass naive UTC
                job.completed_at = datetime.now(UTC).replace(tzinfo=None)  # type: ignore[assignment]
            await db.commit()
