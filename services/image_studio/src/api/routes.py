"""HTTP routes for image_studio."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from services.image_studio.src.core.models import (
    GenerateRequest,
    GenerateResponse,
    JobStatus,
)
from services.image_studio.src.core.use_cases import ImageStudioUseCases

router = APIRouter()


def _uc(request: Request) -> ImageStudioUseCases:
    return request.app.state.container.resolve("image_studio_use_cases")


@router.get("/health")
async def health(request: Request) -> dict:
    return await _uc(request).health()


@router.post("/generate", response_model=GenerateResponse)
async def generate(request: Request, body: GenerateRequest) -> GenerateResponse:
    try:
        return await _uc(request).generate(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/jobs/{prompt_id}", response_model=JobStatus)
async def job_status(request: Request, prompt_id: str) -> JobStatus:
    return await _uc(request).job_status(prompt_id)


@router.get("/images")
async def get_image(
    request: Request,
    filename: str = Query(..., min_length=1),
    subfolder: str = Query(default=""),
    folder_type: str = Query(default="output", alias="type"),
) -> Response:
    try:
        data = await _uc(request).view_image(
            filename=filename,
            subfolder=subfolder,
            folder_type=folder_type,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    media = "image/png"
    lower = filename.lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        media = "image/jpeg"
    elif lower.endswith(".webp"):
        media = "image/webp"
    return Response(content=data, media_type=media)
