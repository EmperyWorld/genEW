"""HTTP routes for music_forge."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from services.music_forge.src.core.models import (
    GenerateRequest,
    GenerateResponse,
    JobStatus,
)
from services.music_forge.src.core.use_cases import MusicForgeUseCases

router = APIRouter()


def _uc(request: Request) -> MusicForgeUseCases:
    return request.app.state.container.resolve("music_forge_use_cases")


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


@router.get("/audio")
async def get_audio(
    request: Request,
    filename: str = Query(..., min_length=1),
    subfolder: str = Query(default=""),
    folder_type: str = Query(default="output", alias="type"),
) -> Response:
    try:
        data = await _uc(request).view_audio(
            filename=filename,
            subfolder=subfolder,
            folder_type=folder_type,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    media = "audio/mpeg"
    lower = filename.lower()
    if lower.endswith(".wav"):
        media = "audio/wav"
    elif lower.endswith(".flac"):
        media = "audio/flac"
    elif lower.endswith(".ogg"):
        media = "audio/ogg"
    return Response(content=data, media_type=media)
