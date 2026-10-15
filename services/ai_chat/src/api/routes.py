"""HTTP routes for ai_chat companion chat."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.ai_chat.src.core.use_cases import AiChatUseCases
from services.ai_chat.src.data.schemas import (
    MessageListResponse,
    MessageResponse,
    SendMessageRequest,
)

router = APIRouter(tags=["ai_chat"])


@router.get("/health")
async def health(request: Request) -> dict:
    uc: AiChatUseCases = request.app.state.container.resolve("service_use_cases")
    return await uc.health()


@router.post("/messages", response_model=MessageResponse, status_code=201)
async def send_message(request: Request, body: SendMessageRequest) -> MessageResponse:
    uc: AiChatUseCases = request.app.state.container.resolve("service_use_cases")
    return await uc.send(
        body,
        authorization=request.headers.get("Authorization"),
    )


@router.get("/messages", response_model=MessageListResponse)
async def list_messages(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> MessageListResponse:
    uc: AiChatUseCases = request.app.state.container.resolve("service_use_cases")
    return await uc.list_messages(
        authorization=request.headers.get("Authorization"),
        limit=limit,
    )
