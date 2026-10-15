"""FastAPI routers for loshkovskiy ops dashboard."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Query, Request

from services.loshkovskiy.src.core.use_cases import LoshkovskiyUseCases
from services.loshkovskiy.src.data.schemas import (
    HealthResponse,
    MetricCreate,
    MetricListResponse,
    MetricView,
)

router = APIRouter()


def _load_manifest() -> dict:
    manifest_path = Path(__file__).resolve().parents[2] / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@router.get("/health", response_model=HealthResponse)
async def health(_request: Request) -> HealthResponse:
    manifest = _load_manifest()
    return HealthResponse(
        status="ok",
        service=manifest["name"],
        version=manifest["version"],
        features=manifest.get("features", []),
    )


@router.post("/metrics", response_model=MetricView, status_code=201)
async def create_metric(payload: MetricCreate, request: Request) -> MetricView:
    uc: LoshkovskiyUseCases = request.app.state.container.resolve("service_use_cases")
    return await uc.create_metric(payload)


@router.get("/metrics", response_model=MetricListResponse)
async def list_metrics(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> MetricListResponse:
    uc: LoshkovskiyUseCases = request.app.state.container.resolve("service_use_cases")
    return await uc.list_metrics(limit=limit)
