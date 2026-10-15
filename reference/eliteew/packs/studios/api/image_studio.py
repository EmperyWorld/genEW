# ------------------------------------------------------------------------------
#  EliteEW · Empery World
#  https://empery.world
#  Author: po&T && TZBrand
# ------------------------------------------------------------------------------
# Purpose:
#   Image Studio API: text-to-image, image-edit, rotate, prompt suggest.
#   Results persist to unified content; billing via UGS skip_queue types.
# Invariants:
#   - All routes require OAuth2 user; no secrets in source.
#   - Idempotency-Key / body idempotency_key forwarded to UGS to avoid double bill on retry.
#   - Rotate modes from api.services.image_studio.rotate_modes (SSOT).
#   - Suggest-prompt / T2I prompts strip Gemma/llama ``<|channel>thought`` markup before Comfy.
# Related:
#   - documentation/product/IMAGE-STUDIO.md
#   - api/routers/creative_studio_utils.py
#   - documentation/platform/docker-re_doc/UGS-IDEMPOTENCY.md
#   - documentation/platform/docker-re_doc/COMFYUI-COMMAND-CENTER-OPERATIONS.md
# ------------------------------------------------------------------------------
"""
Image Studio API: text-to-image and image-edit. Results are saved to unified content for history.

Deploy note: POST /image-edit sends multipart/form-data (image file). If you get 413,
ensure the reverse proxy (nginx, etc.) allows larger body, e.g. in nginx:
  client_max_body_size 10m;
for the API location (or server). Default is often 1m.

Billing: operations go through UGS (generation_types with skip_queue).
"""

from __future__ import annotations

import base64
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from api.core.auth import User
from api.core.oauth2_auth import require_oauth2_user
from api.routers.creative_studio_utils import (
    build_image_edit_input_data,
    decode_base64_image,
    find_studio_ugs_idempotent_reuse,
    run_studio_ugs_generate,
    validate_image_bytes,
)
from api.routers.ugs import get_ugs_service
from api.routers.ugs.deps import _idempotency_key_from_body_or_headers
from api.routers.unified_content import get_content_service
from api.schemas.unified_content import ContentType, Visibility, build_content_create, build_content_update
from api.services.image_studio.rotate_modes import (
    ROTATE_MODE_ALL,
    STUDIO_ROTATE_OUTPUT_NODES,
    rotate_mode_label,
    validate_rotate_mode,
)
from api.services.ugs.unified_generation_service import UnifiedGenerationService
from api.services.unified_content.content_storage_service import ContentStorageService
from api.utils.llm_json_extract import strip_llm_channel_markup, strip_llm_thinking_prefix

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/image-studio", tags=["Image Studio"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024

_IN_PROGRESS_STATUSES = frozenset({"pending", "queued", "processing", "running", "in_progress"})


class TextToImageRequest(BaseModel):
    prompt: str | None = None
    width: int = 1024
    height: int = 1024
    seed: int | None = None
    idempotency_key: str | None = Field(default=None, max_length=220)


class SuggestImagePromptRequest(BaseModel):
    """Тело POST /image-studio/suggest-prompt — идея для AI (как theme в music-generator/lyrics)."""

    idea: str | None = None
    style_hint: str | None = None
    language: str | None = "en"
    idempotency_key: str | None = Field(default=None, max_length=220)


class ImageEditJsonRequest(BaseModel):
    prompt: str | None = None
    image: str | None = None
    negative_prompt: str = ""
    seed: int | None = None
    idempotency_key: str | None = Field(default=None, max_length=220)


def _datetime_str() -> str:
    return datetime.now(UTC).strftime("%Y%m%d_%H%M%S")


def _b64_from_bytes(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _raise_in_progress(reused: dict[str, Any]) -> None:
    raise HTTPException(
        status_code=409,
        detail={
            "code": "image_studio_in_progress",
            "message": reused.get("message") or "Generation already in progress for this idempotency key",
            "request_id": reused.get("request_id"),
        },
    )


async def _run_image_studio_ugs(
    ugs: UnifiedGenerationService,
    *,
    user_id: str,
    type_key: str,
    input_data: dict[str, Any],
    idempotency_key: str | None,
) -> dict[str, Any]:
    """Find reusable idempotent request, else call UGS generate once."""
    if idempotency_key:
        reused = await find_studio_ugs_idempotent_reuse(
            ugs,
            user_id=user_id,
            type_key=type_key,
            idempotency_key=idempotency_key,
        )
        if reused is not None:
            status = str(reused.get("status") or "")
            if status in _IN_PROGRESS_STATUSES:
                _raise_in_progress(reused)
            if status == "completed":
                return reused

    resp = await run_studio_ugs_generate(
        ugs,
        user_id=user_id,
        type_key=type_key,
        input_data=input_data,
        idempotency_key=idempotency_key,
        allow_idempotent_reuse=True,
    )
    if resp.get("reused") and str(resp.get("status") or "") in _IN_PROGRESS_STATUSES:
        _raise_in_progress(resp)
    return resp


async def _persist_image_result(
    *,
    content_service: ContentStorageService,
    user: User,
    first_image: dict[str, Any],
    name: str,
    description: str,
    tags: list[str],
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    b64 = first_image.get("data")
    if not b64:
        return {
            "history_saved": False,
            "history_error": "Generated image is missing data for history storage",
        }

    try:
        image_bytes = base64.b64decode(b64)
        filename = first_image.get("filename") or "image.png"
        content_data = build_content_create(
            user_id=str(user.id),
            name=name,
            description=description,
            content_type=ContentType.IMAGE,
            mime_type="image/png",
            sub_type="image_studio",
            original_filename=filename,
            tags=tags,
            visibility=Visibility.PRIVATE,
            source_service="image_studio",
            source_id=str(uuid4()),
            apply_project_desktop_folder=True,
            metadata=dict(metadata or {}),
        )
        content = await content_service.create_content(
            content_data=content_data,
            file_data=image_bytes,
            user_id=str(user.id),
        )
        if (content.source_service or "").strip() != "image_studio":
            content = await content_service.update_content(
                content.id,
                str(user.id),
                build_content_update(
                    name=name,
                    description=description,
                    tags=tags,
                    sub_type="image_studio",
                    source_service="image_studio",
                    source_id=str(uuid4()),
                ),
            )
    except Exception as exc:
        logger.warning("Image Studio: failed to save to content: %s", exc)
        return {
            "history_saved": False,
            "history_error": "Generated image was created, but saving to history failed",
        }

    return {
        "history_saved": True,
        "content_id": str(content.id),
        "name": content.name or name,
    }


def _unwrap_image_block(ugs_result: dict[str, Any]) -> dict[str, Any]:
    block = ugs_result.get("result") or {}
    if isinstance(block, dict) and "images" not in block and isinstance(block.get("result"), dict):
        inner = block.get("result")
        if isinstance(inner, dict) and "images" in inner:
            return inner
    return block if isinstance(block, dict) else {}


async def _hydrate_studio_images_from_content(
    images: list[dict[str, Any]],
    *,
    user_id: str,
    content_service: ContentStorageService,
) -> list[dict[str, Any]]:
    """UGS may strip base64 and leave content_id — reload bytes for the studio UI."""
    out: list[dict[str, Any]] = []
    for raw in images:
        img = dict(raw)
        if img.get("data"):
            out.append(img)
            continue
        cid = img.get("content_id")
        if not cid:
            out.append(img)
            continue
        try:
            file_bytes, meta = await content_service.read_file_bytes_for_owner(UUID(str(cid)), user_id)
            img["data"] = base64.b64encode(file_bytes).decode("ascii")
            if not img.get("filename"):
                img["filename"] = str(meta.get("original_filename") or meta.get("name") or "image.png")
        except Exception as exc:
            logger.warning(
                "Image Studio: failed to hydrate image from content_id=%s: %s",
                cid,
                exc,
            )
        out.append(img)
    return out


def _any_image_has_data(images: list[dict[str, Any]]) -> bool:
    for img in images:
        data = img.get("data")
        if isinstance(data, str) and data.strip():
            return True
    return False


def _sanitize_image_prompt_text(raw: str) -> str:
    """Strip llama-server / Gemma channel+thinking wrappers before Comfy positive prompt."""
    original = raw or ""
    text = strip_llm_thinking_prefix(strip_llm_channel_markup(original)).strip()
    if not text:
        return ""
    # After tag strip, thought prose often remains above the final prompt line(s).
    low = original.lower()
    if "<|channel" in low or "<channel|" in low:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if len(lines) >= 2:
            for i, ln in enumerate(lines):
                if "," in ln or len(ln) >= 48:
                    return "\n".join(lines[i:]).strip()
            return lines[-1]
    return text


def _text_from_ugs_result(ugs_result: dict[str, Any]) -> str:
    block = ugs_result.get("result") or {}
    raw = ""
    if isinstance(block, dict):
        if isinstance(block.get("result"), dict):
            inner = block["result"]
            raw = str(inner.get("text") or inner.get("content") or inner.get("response") or "")
        else:
            raw = str(block.get("text") or block.get("content") or block.get("response") or "")
    return _sanitize_image_prompt_text(raw)


async def _finalize_image_response(
    *,
    resp: dict[str, Any],
    content_service: ContentStorageService,
    user: User,
    default_filename: str,
    name: str,
    description: str,
    tags: list[str],
) -> dict[str, Any]:
    block = _unwrap_image_block(resp)
    images = block.get("images") or []
    if not images:
        raise HTTPException(status_code=502, detail="No image returned")
    images = await _hydrate_studio_images_from_content(
        images,
        user_id=str(user.id),
        content_service=content_service,
    )
    if not _any_image_has_data(images):
        raise HTTPException(status_code=502, detail="No image returned")
    out: dict[str, Any] = {
        "images": [{"data": img.get("data"), "filename": img.get("filename", default_filename)} for img in images],
        "history_saved": False,
    }
    out.update(
        await _persist_image_result(
            content_service=content_service,
            user=user,
            first_image=images[0],
            name=name,
            description=description,
            tags=tags,
        )
    )
    return out


@router.post("/suggest-prompt")
async def suggest_image_prompt(
    body: SuggestImagePromptRequest,
    http_request: Request,
    user: User = Depends(require_oauth2_user),
    ugs: UnifiedGenerationService = Depends(get_ugs_service),
) -> dict[str, Any]:
    """Сформулировать промпт для создания картинки (Llama через UGS)."""
    idea = (body.idea or "").strip()
    if len(idea) < 2:
        raise HTTPException(status_code=400, detail="idea is required (min 2 characters)")
    if len(idea) > 600:
        idea = idea[:600] + "…"
    style_hint = (body.style_hint or "").strip()[:200]
    lang = (body.language or "en").strip().lower()[:8]
    if lang not in ("en", "ru"):
        lang = "en"

    system_prompt = (
        "You are an expert prompt engineer for text-to-image diffusion models (Z-Image, SDXL). "
        "Reply with ONLY the image prompt text: no titles, no quotes, no markdown, no explanations. "
        "Use comma-separated keywords and short phrases. "
        "Include subject, style, lighting, composition, and quality hints when relevant."
    )
    if lang == "ru":
        system_prompt = (
            "Ты эксперт по промптам для text-to-image (диффузионные модели). "
            "Ответь только текстом промпта: без заголовков, без кавычек, без markdown, без пояснений. "
            "Ключевые слова и короткие фразы через запятую. "
            "Укажи объект, стиль, освещение, композицию, качество — по смыслу."
        )

    if lang == "en":
        user_parts = [f"Subject / scene to depict: {idea}"]
        if style_hint:
            user_parts.append(f"Style hints: {style_hint}")
        user_parts.append("Write the final prompt in English only (comma-separated phrases).")
    else:
        user_parts = [f"Идея / что нарисовать: {idea}"]
        if style_hint:
            user_parts.append(f"Пожелания по стилю: {style_hint}")
        user_parts.append("Сформулируй итоговый промпт на русском (фразы через запятую).")
    user_prompt = "\n".join(user_parts)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    idem = _idempotency_key_from_body_or_headers(body.idempotency_key, http_request)
    try:
        resp = await _run_image_studio_ugs(
            ugs,
            user_id=str(user.id),
            type_key="image_studio_image_prompt",
            input_data={"messages": messages},
            idempotency_key=idem,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Image Studio suggest-prompt failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Prompt suggestion failed: {e}") from e

    content = _text_from_ugs_result(resp)
    if not content:
        raise HTTPException(status_code=502, detail="AI returned empty prompt")
    if len(content) > 4000:
        content = content[:4000].rsplit(",", 1)[0] + "…"
    return {"prompt": content}


@router.post("/text-to-image")
async def text_to_image(
    body: TextToImageRequest,
    http_request: Request,
    user: User = Depends(require_oauth2_user),
    content_service: ContentStorageService = Depends(get_content_service),
    ugs: UnifiedGenerationService = Depends(get_ugs_service),
) -> dict[str, Any]:
    """Generate image from text."""
    prompt = _sanitize_image_prompt_text(body.prompt or "")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    width = max(256, min(2048, body.width))
    height = max(256, min(2048, body.height))
    seed = body.seed if body.seed is not None else -1
    idem = _idempotency_key_from_body_or_headers(body.idempotency_key, http_request)

    try:
        resp = await _run_image_studio_ugs(
            ugs,
            user_id=str(user.id),
            type_key="image_studio_text_to_image",
            input_data={
                "prompt": prompt,
                "width": width,
                "height": height,
                "seed": seed,
            },
            idempotency_key=idem,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Image Studio text-to-image failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Generation failed: {e}") from e

    return await _finalize_image_response(
        resp=resp,
        content_service=content_service,
        user=user,
        default_filename="image.png",
        name=f"Изображение {_datetime_str()}",
        description="Генерация по тексту",
        tags=["image_studio", "text_to_image"],
    )


@router.post("/image-edit")
async def image_edit(
    http_request: Request,
    prompt: str = Form(..., description="Edit instruction (e.g. remove the car)"),
    image: UploadFile = File(..., description="Image file to edit"),
    negative_prompt: str = Form(""),
    seed: str | None = Form(None),
    idempotency_key: str | None = Form(None),
    user: User = Depends(require_oauth2_user),
    content_service: ContentStorageService = Depends(get_content_service),
    ugs: UnifiedGenerationService = Depends(get_ugs_service),
) -> dict[str, Any]:
    """Edit image by instruction (multipart)."""
    prompt = (prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    image_bytes = await image.read()
    validate_image_bytes(image_bytes, MAX_IMAGE_BYTES)

    try:
        seed_int = int(seed) if (seed and str(seed).strip()) else -1
    except TypeError, ValueError:
        seed_int = -1

    idem = _idempotency_key_from_body_or_headers(idempotency_key, http_request)
    try:
        resp = await _run_image_studio_ugs(
            ugs,
            user_id=str(user.id),
            type_key="image_studio_image_edit",
            input_data=build_image_edit_input_data(
                prompt=prompt,
                image_base64=_b64_from_bytes(image_bytes),
                negative_prompt=negative_prompt or "",
                seed=seed_int,
            ),
            idempotency_key=idem,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Image Studio image-edit failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Generation failed: {e}") from e

    return await _finalize_image_response(
        resp=resp,
        content_service=content_service,
        user=user,
        default_filename="edited.png",
        name=f"Редактирование {_datetime_str()}",
        description="Редактирование по инструкции",
        tags=["image_studio", "image_edit"],
    )


@router.post("/image-edit-json")
async def image_edit_json(
    body: ImageEditJsonRequest,
    http_request: Request,
    user: User = Depends(require_oauth2_user),
    content_service: ContentStorageService = Depends(get_content_service),
    ugs: UnifiedGenerationService = Depends(get_ugs_service),
) -> dict[str, Any]:
    """Edit image by instruction (JSON body with base64 image)."""
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    image_b64 = body.image
    if not image_b64:
        raise HTTPException(status_code=400, detail="image (base64) is required")
    image_bytes = decode_base64_image(image_b64, MAX_IMAGE_BYTES)
    negative_prompt = (body.negative_prompt or "").strip()
    seed = body.seed if body.seed is not None else -1
    idem = _idempotency_key_from_body_or_headers(body.idempotency_key, http_request)

    try:
        resp = await _run_image_studio_ugs(
            ugs,
            user_id=str(user.id),
            type_key="image_studio_image_edit",
            input_data=build_image_edit_input_data(
                prompt=prompt,
                image_base64=_b64_from_bytes(image_bytes),
                negative_prompt=negative_prompt,
                seed=seed,
            ),
            idempotency_key=idem,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Image Studio image-edit failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Generation failed: {e}") from e

    return await _finalize_image_response(
        resp=resp,
        content_service=content_service,
        user=user,
        default_filename="edited.png",
        name=f"Редактирование {_datetime_str()}",
        description="Редактирование по инструкции",
        tags=["image_studio", "image_edit"],
    )


@router.post("/image-rotate")
async def image_rotate(
    http_request: Request,
    image: UploadFile = File(..., description="Image file to transform"),
    mode: str = Form(
        "angle90_right",
        description=(
            "Camera/view mode: close_up, wide, angle45_right, angle90_right, aerial, "
            "low, angle45_left, angle90_left, or 'all' for all views"
        ),
    ),
    idempotency_key: str | None = Form(None),
    user: User = Depends(require_oauth2_user),
    content_service: ContentStorageService = Depends(get_content_service),
    ugs: UnifiedGenerationService = Depends(get_ugs_service),
) -> dict[str, Any]:
    """Change camera/view of the image (Comfy rotate workflow via UGS)."""
    try:
        mode_key = validate_rotate_mode(mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    image_bytes = await image.read()
    validate_image_bytes(image_bytes, MAX_IMAGE_BYTES)
    label = rotate_mode_label(mode_key)
    idem = _idempotency_key_from_body_or_headers(idempotency_key, http_request)

    try:
        resp = await _run_image_studio_ugs(
            ugs,
            user_id=str(user.id),
            type_key="image_studio_image_rotate",
            input_data={
                "image_base64": _b64_from_bytes(image_bytes),
                "mode": mode_key,
            },
            idempotency_key=idem,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Image Studio image-rotate failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Generation failed: {e}") from e

    return await _finalize_image_response(
        resp=resp,
        content_service=content_service,
        user=user,
        default_filename="rotated.png",
        name=f"{label} {_datetime_str()}",
        description="Изменение ракурса / поворот камеры",
        tags=[
            "image_studio",
            "rotate_image",
            (mode_key if mode_key != ROTATE_MODE_ALL else "all_views"),
        ],
    )


# Back-compat alias for tests/importers that expected the old name on the router module.
ROTATE_OUTPUT_NODES = STUDIO_ROTATE_OUTPUT_NODES
