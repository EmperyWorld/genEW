"""HTTP routes for video_studio."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response

from services.video_studio.src.core.models import GenerateResponse, JobStatus
from services.video_studio.src.core.use_cases import VideoStudioUseCases

router = APIRouter()

_MAX_IMAGE_BYTES = 10 * 1024 * 1024


def _uc(request: Request) -> VideoStudioUseCases:
    return request.app.state.container.resolve("video_studio_use_cases")


@router.get("/health")
async def health(request: Request) -> dict:
    return await _uc(request).health()


@router.post("/generate", response_model=GenerateResponse)
async def generate(
    request: Request,
    prompt: str = Form(..., min_length=1, max_length=4000),
    image: UploadFile = File(...),
    negative_prompt: str = Form(default=""),
    seed: int | None = Form(default=None),
    width: int | None = Form(default=None),
    height: int | None = Form(default=None),
    length: int | None = Form(default=None),
) -> GenerateResponse:
    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="image is empty")
    if len(raw) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="image exceeds 10MB")
    filename = image.filename or "source.png"
    try:
        return await _uc(request).generate(
            prompt=prompt,
            image_bytes=raw,
            image_filename=filename,
            negative_prompt=negative_prompt,
            seed=seed,
            width=width,
            height=height,
            length=length,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/jobs/{prompt_id}", response_model=JobStatus)
async def job_status(request: Request, prompt_id: str) -> JobStatus:
    return await _uc(request).job_status(prompt_id)


@router.get("/videos")
async def get_video(
    request: Request,
    filename: str = Query(..., min_length=1),
    subfolder: str = Query(default=""),
    folder_type: str = Query(default="output", alias="type"),
) -> Response:
    try:
        data = await _uc(request).view_video(
            filename=filename,
            subfolder=subfolder,
            folder_type=folder_type,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    media = "video/mp4"
    lower = filename.lower()
    if lower.endswith(".webm"):
        media = "video/webm"
    elif lower.endswith(".webp"):
        media = "image/webp"
    elif lower.endswith(".gif"):
        media = "image/gif"
    return Response(content=data, media_type=media)
