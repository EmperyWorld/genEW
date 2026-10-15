"""ECC BFF routes for ai_chat chat."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.ai_chat_bff_use_cases import (
    EccAiChatBffUseCases,
)
from services.empery_control_center_api.src.data.ai_chat_schemas import (
    EccMessageListResponse,
    EccMessageView,
    EccSendMessageRequest,
)

router = APIRouter(prefix="/ai-chat", tags=["ai-chat"])


def _uc(request: Request) -> EccAiChatBffUseCases:
    return request.app.state.container.resolve("ecc_ai_chat_bff_use_cases")


@router.get("/messages", response_model=EccMessageListResponse)
async def list_messages(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> EccMessageListResponse:
    auth = request.headers.get("authorization")
    return await _uc(request).list_messages(auth, limit=limit)


@router.post("/messages", response_model=EccMessageView, status_code=201)
async def send_message(
    request: Request, body: EccSendMessageRequest
) -> EccMessageView:
    auth = request.headers.get("authorization")
    return await _uc(request).send_message(auth, body)
