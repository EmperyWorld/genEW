"""ECC BFF routes for asm_prod_acc_20261006110325 metrics."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.asm_prod_acc_20261006110325_bff_use_cases import (
    EccAsmProdAcc20261006110325BffUseCases,
)
from services.empery_control_center_api.src.data.asm_prod_acc_20261006110325_schemas import (
    EccMetricListResponse,
)

router = APIRouter(prefix="/asm-prod-acc-20261006110325", tags=["asm-prod-acc-20261006110325"])


def _uc(request: Request) -> EccAsmProdAcc20261006110325BffUseCases:
    return request.app.state.container.resolve("ecc_asm_prod_acc_20261006110325_bff_use_cases")


@router.get("/metrics", response_model=EccMetricListResponse)
async def list_metrics(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> EccMetricListResponse:
    auth = request.headers.get("authorization")
    return await _uc(request).list_metrics(auth, limit=limit)
