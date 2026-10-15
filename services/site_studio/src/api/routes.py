"""HTTP routes for site_studio."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from services.site_studio.src.core.models import (
    DraftSummary,
    PreviewRequest,
    PreviewResponse,
)
from services.site_studio.src.core.use_cases import SiteStudioUseCases

router = APIRouter()


def _uc(request: Request) -> SiteStudioUseCases:
    return request.app.state.container.resolve("site_studio_use_cases")


@router.get("/health")
async def health(request: Request) -> dict:
    return await _uc(request).health()


@router.post("/preview", response_model=PreviewResponse)
async def generate_preview(request: Request, body: PreviewRequest) -> PreviewResponse:
    try:
        return await _uc(request).generate_preview(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/drafts", response_model=list[DraftSummary])
async def list_drafts(request: Request) -> list[DraftSummary]:
    return _uc(request).list_drafts()


@router.get("/drafts/{draft_id}", response_model=PreviewResponse)
async def get_draft(request: Request, draft_id: str) -> PreviewResponse:
    try:
        return _uc(request).get_preview(draft_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="draft not found") from exc


@router.get("/drafts/{draft_id}/html", response_class=HTMLResponse)
async def get_draft_html(request: Request, draft_id: str) -> HTMLResponse:
    try:
        preview = _uc(request).get_preview(draft_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="draft not found") from exc
    return HTMLResponse(content=preview.html)
