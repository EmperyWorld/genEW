"""ECC BFF routes for loshkovskiy metrics."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.loshkovskiy_bff_use_cases import (
    EccLoshkovskiyBffUseCases,
)
from services.empery_control_center_api.src.data.loshkovskiy_schemas import (
    EccMetricListResponse,
)

router = APIRouter(prefix="/loshkovskiy", tags=["loshkovskiy"])


def _uc(request: Request) -> EccLoshkovskiyBffUseCases:
    return request.app.state.container.resolve("ecc_loshkovskiy_bff_use_cases")


@router.get("/metrics", response_model=EccMetricListResponse)
async def list_metrics(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> EccMetricListResponse:
    auth = request.headers.get("authorization")
    return await _uc(request).list_metrics(auth, limit=limit)
