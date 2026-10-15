"""ECC BFF routes for dedmoroz chat."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.dedmoroz_bff_use_cases import (
    EccDedmorozBffUseCases,
)
from services.empery_control_center_api.src.data.dedmoroz_schemas import (
    EccMessageListResponse,
    EccMessageView,
    EccSendMessageRequest,
)

router = APIRouter(prefix="/dedmoroz", tags=["dedmoroz"])


def _uc(request: Request) -> EccDedmorozBffUseCases:
    return request.app.state.container.resolve("ecc_dedmoroz_bff_use_cases")


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
