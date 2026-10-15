# ------------------------------------------------------------------------------
#  EliteEW · Empery World
#  https://eliteew.ru
#  Author: po&T <keysray70@gmail.com>
# ------------------------------------------------------------------------------
# Purpose:
#   Video Studio API: image-to-video (Wan 2.2 I2V). Results saved to unified content for
#   history.
# Invariants:
#   - Маршруты и авторизация — как реализовано в модуле; секреты не в исходниках.
# Related:
#   - EliteEW/api/main.py (регистрация роутеров); см. затронутые services/models.
# ------------------------------------------------------------------------------
"""
Video Studio API: image-to-video (Wan 2.2 I2V). Results saved to unified content for history.

Uses workflow: comfyui/video_wan2_2_14B_image.json (LoadImage -> WanImageToVideo -> SaveVideo).
Billing: UGS type video_studio_image_to_video (skip_queue).
"""

import base64
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel  # type: ignore[import-untyped]

from api.core.auth import User
from api.core.oauth2_auth import require_oauth2_user
from api.routers.creative_studio_utils import (
    decode_base64_image,
    run_studio_ugs_generate,
    validate_image_bytes,
)
from api.routers.ugs import get_ugs_service
from api.routers.unified_content import get_content_service
from api.schemas.unified_content import ContentCreate, ContentType, Visibility
from api.services.ugs.unified_generation_service import UnifiedGenerationService
from api.services.unified_content.content_storage_service import ContentStorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/video-studio", tags=["Video Studio"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


class ImageToVideoJsonRequest(BaseModel):
    prompt: str | None = None
    image: str | None = None
    negative_prompt: str = ""


class SuggestVideoPromptRequest(BaseModel):
    """Тело POST /video-studio/suggest-prompt — задача пользователя для AI motion prompt."""

    idea: str | None = None
    scene_hint: str | None = None
    language: str | None = "en"


def _datetime_str() -> str:
    return datetime.now(UTC).strftime("%Y%m%d_%H%M%S")


def _b64_from_bytes(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _unwrap_video_block(ugs_result: dict[str, Any]) -> dict[str, Any]:
    block = ugs_result.get("result") or {}
    if isinstance(block, dict) and "videos" not in block and isinstance(block.get("result"), dict):
        inner = block.get("result")
        if isinstance(inner, dict) and "videos" in inner:
            return inner
    return block if isinstance(block, dict) else {}


def _text_from_ugs_result(ugs_result: dict[str, Any]) -> str:
    block = ugs_result.get("result") or {}
    if isinstance(block, dict):
        if isinstance(block.get("result"), dict):
            inner = block["result"]
            return str(inner.get("text") or inner.get("content") or inner.get("response") or "").strip()
        return str(block.get("text") or block.get("content") or block.get("response") or "").strip()
    return ""


def _video_b64_is_usable(data: str | None) -> bool:
    if not isinstance(data, str) or not data.strip():
        return False
    if data.endswith("...TRUNCATED..."):
        return False
    try:
        decoded = base64.b64decode(data, validate=True)
    except Exception:
        return False
    return len(decoded) > 1000


async def _resolve_video_b64(
    first_video: dict[str, Any],
    *,
    ugs: UnifiedGenerationService,
) -> str | None:
    data = first_video.get("data")
    if _video_b64_is_usable(data if isinstance(data, str) else None):
        return data if isinstance(data, str) else None

    storage_ref = first_video.get("storage_reference")
    if isinstance(storage_ref, dict):
        filename = storage_ref.get("filename")
        if isinstance(filename, str) and filename.strip():
            subfolder = storage_ref.get("subfolder", "")
            fetched = await ugs.provider_manager.fetch_comfyui_output_video(
                filename,
                subfolder if isinstance(subfolder, str) else "",
            )
            if _video_b64_is_usable(fetched):
                return fetched

    filename = first_video.get("filename")
    if isinstance(filename, str) and filename.strip():
        subfolder = first_video.get("subfolder", "")
        fetched = await ugs.provider_manager.fetch_comfyui_output_video(
            filename,
            subfolder if isinstance(subfolder, str) else "",
        )
        if _video_b64_is_usable(fetched):
            return fetched
    return None


async def _persist_video_result(
    *,
    content_service: ContentStorageService,
    user: User,
    first_video: dict[str, Any],
    ugs: UnifiedGenerationService | None = None,
) -> dict[str, Any]:
    b64 = first_video.get("data")
    if not _video_b64_is_usable(b64 if isinstance(b64, str) else None) and ugs is not None:
        b64 = await _resolve_video_b64(first_video, ugs=ugs)
    if not b64:
        return {
            "history_saved": False,
            "history_error": "Generated video is missing data for history storage",
        }

    try:
        video_bytes = base64.b64decode(b64)
        if len(video_bytes) <= 1000:
            return {
                "history_saved": False,
                "history_error": "Generated video payload is too small to save",
            }
        out_filename = first_video.get("filename") or "video.mp4"
        name = f"Видео {_datetime_str()}"
        content_data = ContentCreate(
            user_id=str(user.id),
            name=name,
            description="Изображение в видео (Wan 2.2 I2V)",
            content_type=ContentType.VIDEO,
            mime_type="video/mp4",
            sub_type="video_studio",
            original_filename=out_filename,
            tags=["video_studio", "image_to_video"],
            visibility=Visibility.PRIVATE,
            source_service="video_studio",
            source_id=str(uuid4()),
            company_id=None,
            project_id=None,
            title=None,
            word_count=None,
            character_count=None,
            access_level=None,
            is_public=None,
            folder_item_id=None,
            apply_project_desktop_folder=True,
        )
        content = await content_service.create_content(
            content_data=content_data,
            file_data=video_bytes,
            user_id=str(user.id),
        )
    except Exception as exc:
        logger.warning("Video Studio: failed to save to content: %s", exc)
        return {
            "history_saved": False,
            "history_error": "Generated video was created, but saving to history failed",
        }

    return {
        "history_saved": True,
        "content_id": str(content.id),
        "name": content.name or name,
    }


def _build_video_response(
    videos: list[dict[str, Any]],
    persist_result: dict[str, Any],
    *,
    resolved_b64: str | None = None,
) -> dict[str, Any]:
    history_saved = bool(persist_result.get("history_saved"))
    response_videos = []
    for video in videos:
        payload = {"filename": video.get("filename", "video.mp4")}
        if not history_saved:
            payload["data"] = resolved_b64 or video.get("data")
        response_videos.append(payload)

    out: dict[str, Any] = {
        "videos": response_videos,
        "history_saved": history_saved,
    }
    if persist_result.get("history_error"):
        out["history_error"] = persist_result["history_error"]
    if persist_result.get("content_id"):
        out["content_id"] = persist_result["content_id"]
    if persist_result.get("name"):
        out["name"] = persist_result["name"]
    return out


@router.post("/suggest-prompt")
async def suggest_video_prompt(
    body: SuggestVideoPromptRequest,
    user: User = Depends(require_oauth2_user),
    ugs: UnifiedGenerationService = Depends(get_ugs_service),
) -> dict[str, Any]:
    """
    Сформулировать motion prompt для Wan 2.2 I2V (Llama через UGS) по задаче пользователя.
    Body: idea (required), scene_hint?, language? (en|ru — язык ответа; для ComfyUI лучше en).
    Returns: { "prompt": "..." }
    """
    idea = (body.idea or "").strip()
    if len(idea) < 2:
        raise HTTPException(status_code=400, detail="idea is required (min 2 characters)")
    if len(idea) > 600:
        idea = idea[:600] + "…"
    scene_hint = (body.scene_hint or "").strip()[:200]
    lang = (body.language or "en").strip().lower()[:8]
    if lang not in ("en", "ru"):
        lang = "en"

    system_prompt = (
        "You are an expert prompt engineer for Wan 2.2 image-to-video diffusion. "
        "The model already receives a still image; your prompt must describe MOTION only: "
        "camera movement (push in, orbit, pan, tilt), subject/body motion, hair, fabric, "
        "light changes, atmosphere — not a full scene description. "
        "Reply with ONLY the final prompt text: no titles, quotes, markdown, or explanations. "
        "Prefer 1–3 short English sentences in cinematic present tense."
    )
    if lang == "ru":
        system_prompt = (
            "Ты эксперт по motion prompt для Wan 2.2 image-to-video. "
            "Модель уже получает кадр-картинку; промпт должен описывать только ДВИЖЕНИЕ: "
            "камера, действие персонажа, волосы, ткань, свет, атмосфера — не пересказывать всю сцену. "
            "Ответь только текстом промпта: без заголовков, кавычек, markdown и пояснений. "
            "1–3 коротких предложения, настоящее время."
        )

    if lang == "en":
        user_parts = [
            f"Task / desired motion: {idea}",
            "Write the final motion prompt in English only.",
            "Do not restate static appearance from the image; focus on what moves and how the camera behaves.",
        ]
        if scene_hint:
            user_parts.insert(1, f"Scene context (optional): {scene_hint}")
    else:
        user_parts = [
            f"Задача / желаемое движение: {idea}",
            "Сформулируй итоговый motion prompt на русском.",
            "Не пересказывай статичный кадр; опиши движение и камеру.",
        ]
        if scene_hint:
            user_parts.insert(1, f"Контекст сцены (опционально): {scene_hint}")
    user_prompt = "\n".join(user_parts)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    try:
        resp = await run_studio_ugs_generate(
            ugs,
            user_id=str(user.id),
            type_key="video_studio_image_prompt",
            input_data={"messages": messages},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video Studio suggest-prompt failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Prompt suggestion failed: {e}") from e

    content = _text_from_ugs_result(resp)
    if not content:
        raise HTTPException(status_code=502, detail="AI returned empty prompt")
    if len(content) > 2000:
        content = content[:2000].rsplit(".", 1)[0] + "."
    return {"prompt": content}


@router.post("/image-to-video")
async def image_to_video(
    prompt: str = Form(..., description="Описание движения/сцены (positive prompt, лучше на английском)"),
    image: UploadFile = File(..., description="Исходное изображение"),
    negative_prompt: str = Form(""),
    user: User = Depends(require_oauth2_user),
    content_service: ContentStorageService = Depends(get_content_service),
    ugs: UnifiedGenerationService = Depends(get_ugs_service),
) -> dict[str, Any]:
    """
    Image-to-video: загрузить изображение и описание движения, получить короткое видео (Wan 2.2 I2V).
    Multipart: prompt (required), image (file), negative_prompt?.
    Returns: { "videos": [...], "content_id": "...", "name": "..." }
    """
    prompt = (prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    image_bytes = await image.read()
    validate_image_bytes(image_bytes, MAX_IMAGE_BYTES)

    try:
        resp = await run_studio_ugs_generate(
            ugs,
            user_id=str(user.id),
            type_key="video_studio_image_to_video",
            input_data={
                "prompt": prompt,
                "image_base64": _b64_from_bytes(image_bytes),
                "negative_prompt": negative_prompt or "",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video Studio image-to-video failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Generation failed: {e}") from e

    block = _unwrap_video_block(resp)
    videos = block.get("videos") or []
    if not videos:
        raise HTTPException(status_code=502, detail="No video returned")
    resolved_b64 = await _resolve_video_b64(videos[0], ugs=ugs)
    if not _video_b64_is_usable(resolved_b64):
        raise HTTPException(status_code=502, detail="Video generation completed but file could not be retrieved")
    persist_result = await _persist_video_result(
        content_service=content_service,
        user=user,
        first_video=videos[0],
        ugs=ugs,
    )
    return _build_video_response(videos, persist_result, resolved_b64=resolved_b64)


@router.post("/image-to-video-json")
async def image_to_video_json(
    body: ImageToVideoJsonRequest,
    user: User = Depends(require_oauth2_user),
    content_service: ContentStorageService = Depends(get_content_service),
    ugs: UnifiedGenerationService = Depends(get_ugs_service),
) -> dict[str, Any]:
    """
    Image-to-video with JSON body (base64 image).
    Body: prompt (required), image (base64 string), negative_prompt?.
    """
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    image_b64 = body.image
    if not image_b64:
        raise HTTPException(status_code=400, detail="image (base64) is required")
    image_bytes = decode_base64_image(image_b64, MAX_IMAGE_BYTES)
    negative_prompt = (body.negative_prompt or "").strip()

    try:
        resp = await run_studio_ugs_generate(
            ugs,
            user_id=str(user.id),
            type_key="video_studio_image_to_video",
            input_data={
                "prompt": prompt,
                "image_base64": _b64_from_bytes(image_bytes),
                "negative_prompt": negative_prompt,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video Studio image-to-video failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Generation failed: {e}") from e

    block = _unwrap_video_block(resp)
    videos = block.get("videos") or []
    if not videos:
        raise HTTPException(status_code=502, detail="No video returned")
    resolved_b64 = await _resolve_video_b64(videos[0], ugs=ugs)
    if not _video_b64_is_usable(resolved_b64):
        raise HTTPException(status_code=502, detail="Video generation completed but file could not be retrieved")
    persist_result = await _persist_video_result(
        content_service=content_service,
        user=user,
        first_video=videos[0],
        ugs=ugs,
    )
    return _build_video_response(videos, persist_result, resolved_b64=resolved_b64)
