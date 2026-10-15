"""FastAPI routers for intelligence_service."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Request

from services.intelligence_service.src.core.use_cases import IntelligenceUseCases
from services.intelligence_service.src.data.schemas import (
    AnalyzeTaskRequest,
    HealthResponse,
    InsightResponse,
)

router = APIRouter()


def _load_manifest() -> dict:
    manifest_path = Path(__file__).resolve().parents[2] / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    manifest = _load_manifest()
    container = request.app.state.container
    database_ready = False
    if container.has("postgres_adapter"):
        try:
            await container.resolve("postgres_adapter").ensure_ready()
            database_ready = True
        except Exception:  # noqa: BLE001 — health must not raise
            database_ready = False
    ai_ready = container.has("ai_provider")
    return HealthResponse(
        status="ok",
        service=manifest["name"],
        version=manifest["version"],
        features=manifest.get("features", []),
        database_ready=database_ready,
        ai_ready=ai_ready,
    )


@router.get("/insights/{task_id}", response_model=InsightResponse)
async def get_insight(task_id: UUID, request: Request) -> InsightResponse:
    use_cases: IntelligenceUseCases = request.app.state.container.resolve(
        "intelligence_use_cases"
    )
    return await use_cases.get_insight(task_id)


@router.post("/insights/analyze", response_model=InsightResponse, status_code=201)
async def analyze_insight(
    payload: AnalyzeTaskRequest,
    request: Request,
) -> InsightResponse:
    use_cases: IntelligenceUseCases = request.app.state.container.resolve(
        "intelligence_use_cases"
    )
    return await use_cases.analyze_manual(payload)
