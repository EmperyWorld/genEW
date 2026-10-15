# ------------------------------------------------------------------------------
#  EliteEW · Empery World
#  https://eliteew.ru
#  Author: po&T <keysray70@gmail.com>
# ------------------------------------------------------------------------------
# Purpose:
#   HTTP API `api/routers/creative_studio_utils.py`: эндпоинты и контракт — в коде и
#   OpenAPI.
# Invariants:
#   - Маршруты и авторизация — как реализовано в модуле; секреты не в исходниках.
# Related:
#   - EliteEW/api/main.py (регистрация роутеров); см. затронутые services/models.
# ------------------------------------------------------------------------------
from __future__ import annotations

import base64
import inspect
import re
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError  # type: ignore[import-untyped]

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")
_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def validate_image_bytes(image_bytes: bytes, max_bytes: int) -> None:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file")
    if len(image_bytes) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large (max {max_bytes // (1024 * 1024)} MB)",
        )

    try:
        with Image.open(BytesIO(image_bytes)) as img:
            img.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image") from exc


def validate_professional_worlds_media_image(
    image_bytes: bytes,
    *,
    max_bytes: int,
    max_edge_px: int = 8192,
) -> tuple[int, int]:
    """Validate Professional Worlds media: size, decode, allowed raster formats, pixel bounds."""
    validate_image_bytes(image_bytes, max_bytes)
    allowed_formats = {"JPEG", "PNG", "WEBP"}

    try:
        with Image.open(BytesIO(image_bytes)) as img:
            fmt = (img.format or "").upper()
            if fmt not in allowed_formats:
                allowed_txt = ", ".join(sorted(allowed_formats))
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported image format ({fmt or 'unknown'}). Use {allowed_txt}.",
                )
            w, h = img.size
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Image decode failed") from exc

    if w < 16 or h < 16:
        raise HTTPException(status_code=400, detail="Image dimensions too small for processing")
    if w > max_edge_px or h > max_edge_px:
        raise HTTPException(
            status_code=400,
            detail=f"Image exceeds maximum edge ({max_edge_px}px); resize before upload.",
        )
    return w, h


def decode_base64_image(image_b64: str, max_bytes: int) -> bytes:
    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image") from exc

    validate_image_bytes(image_bytes, max_bytes)
    return image_bytes


def build_image_edit_input_data(
    *,
    prompt: str,
    image_base64: str,
    negative_prompt: str = "",
    seed: int = -1,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build canonical Image Studio edit payload for UGS."""
    payload: dict[str, Any] = {
        "prompt": (prompt or "").strip(),
        "image_base64": image_base64,
        "negative_prompt": (negative_prompt or "").strip(),
        "seed": seed,
    }
    if extra:
        payload.update(extra)
    return payload


def build_unique_upload_filename(
    original_filename: str | None,
    *,
    prefix: str,
    fallback_extension: str = ".png",
) -> str:
    candidate = Path(original_filename or "").name
    stem = Path(candidate).stem if candidate else prefix
    ext = Path(candidate).suffix.lower()
    if ext not in IMAGE_EXTENSIONS and fallback_extension in IMAGE_EXTENSIONS:
        ext = fallback_extension

    safe_stem = _SAFE_FILENAME_RE.sub("_", stem).strip("._-") or prefix
    return f"{prefix}_{safe_stem}_{uuid4().hex[:12]}{ext}"


def raise_http_from_ugs_value_error(exc: ValueError) -> None:
    """Map UGS/billing ValueError to 402 (credits/limits) or 400.

    402 detail is structured ``{code, message}`` so FE can i18n without parsing English strings.
    """
    err = str(exc)
    if "Insufficient credits" in err or "limit exceeded" in err.lower():
        raise HTTPException(
            status_code=402,
            detail={"code": "insufficient_credits", "message": err},
        ) from exc
    raise HTTPException(status_code=400, detail=err) from exc


async def find_studio_ugs_idempotent_reuse(
    ugs: Any,
    *,
    user_id: str,
    type_key: str,
    idempotency_key: str,
) -> dict[str, Any] | None:
    """
    Return an existing UGS generation payload for (user, type_key, idempotency_key), or None.
    Used by studio routers to short-circuit duplicate HTTP retries before billing work.
    """
    from api.services.ugs.unified_generation_service import IDEMPOTENT_REUSABLE_STATUSES

    generation_type_or_awaitable = ugs.type_service.get_by_key(type_key)
    generation_type = (
        await generation_type_or_awaitable
        if inspect.isawaitable(generation_type_or_awaitable)
        else generation_type_or_awaitable
    )
    if not generation_type:
        return None
    existing = await ugs._find_latest_idempotent_request(
        user_id=user_id,
        generation_type=generation_type,
        idempotency_key=idempotency_key,
    )
    if existing is None:
        return None
    status_payload = ugs._status_payload_from_request(existing)
    status = str(status_payload.get("status") or "pending")
    if status not in IDEMPOTENT_REUSABLE_STATUSES:
        return None
    return await ugs._build_reused_generation_response(existing, generation_type)


async def run_studio_ugs_generate(
    ugs: Any,
    *,
    user_id: str,
    type_key: str,
    input_data: dict[str, Any],
    idempotency_key: str | None = None,
    allow_idempotent_reuse: bool = False,
) -> dict[str, Any]:
    """
    Call UnifiedGenerationService.generate for creative studios (skip_queue types).
    Returns the top-level UGS response dict (status, result, ...).

    Pass ``idempotency_key`` when the HTTP layer has ``Idempotency-Key`` (or equivalent)
    so retries do not duplicate billing work.
    """
    try:
        resp = await ugs.generate(
            user_id=user_id,
            type_key=type_key,
            input_data=input_data,
            idempotency_key=idempotency_key,
        )
    except ValueError as e:
        raise_http_from_ugs_value_error(e)
    if allow_idempotent_reuse and resp.get("reused"):
        return resp
    if resp.get("status") != "completed":
        raise HTTPException(
            status_code=502,
            detail=resp.get("message") or "Generation did not complete",
        )
    return resp
