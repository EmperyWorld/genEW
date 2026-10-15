"""HTTP routes for dedmoroz companion chat."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.dedmoroz.src.core.use_cases import DedmorozUseCases
from services.dedmoroz.src.data.schemas import (
    MessageListResponse,
    MessageResponse,
    SendMessageRequest,
)

router = APIRouter(tags=["dedmoroz"])


@router.get("/health")
async def health(request: Request) -> dict:
    uc: DedmorozUseCases = request.app.state.container.resolve("service_use_cases")
    return await uc.health()


@router.post("/messages", response_model=MessageResponse, status_code=201)
async def send_message(request: Request, body: SendMessageRequest) -> MessageResponse:
    uc: DedmorozUseCases = request.app.state.container.resolve("service_use_cases")
    return await uc.send(
        body,
        authorization=request.headers.get("Authorization"),
    )


@router.get("/messages", response_model=MessageListResponse)
async def list_messages(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> MessageListResponse:
    uc: DedmorozUseCases = request.app.state.container.resolve("service_use_cases")
    return await uc.list_messages(
        authorization=request.headers.get("Authorization"),
        limit=limit,
    )
