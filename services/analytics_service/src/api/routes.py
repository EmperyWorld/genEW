"""FastAPI routers for analytics_service."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Query, Request

from services.analytics_service.src.core.use_cases import AnalyticsUseCases
from services.analytics_service.src.data.schemas import (
    AggregateByTypeResponse,
    EventListResponse,
    HealthResponse,
    IngestEventRequest,
    IngestEventResponse,
)

router = APIRouter()


def _load_manifest() -> dict:
    manifest_path = Path(__file__).resolve().parents[2] / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    manifest = _load_manifest()
    database_ready = False
    container = request.app.state.container
    if container.has("postgres_adapter"):
        try:
            await container.resolve("postgres_adapter").ensure_ready()
            database_ready = True
        except Exception:  # noqa: BLE001 — health must not raise
            database_ready = False
    return HealthResponse(
        status="ok",
        service=manifest["name"],
        version=manifest["version"],
        features=manifest.get("features", []),
        database_ready=database_ready,
    )


@router.post("/events", response_model=IngestEventResponse, status_code=201)
async def ingest_event(
    payload: IngestEventRequest,
    request: Request,
) -> IngestEventResponse:
    use_cases: AnalyticsUseCases = request.app.state.container.resolve(
        "analytics_use_cases"
    )
    return await use_cases.ingest_event(payload)


@router.get("/events", response_model=EventListResponse)
async def list_events(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    event_type: str | None = Query(default=None),
) -> EventListResponse:
    use_cases: AnalyticsUseCases = request.app.state.container.resolve(
        "analytics_use_cases"
    )
    return await use_cases.list_events(limit=limit, event_type=event_type)


@router.get("/events/aggregates/by-type", response_model=AggregateByTypeResponse)
async def aggregates_by_type(
    request: Request,
    event_type: str | None = Query(default=None),
) -> AggregateByTypeResponse:
    use_cases: AnalyticsUseCases = request.app.state.container.resolve(
        "analytics_use_cases"
    )
    return await use_cases.aggregate_by_type(event_type=event_type)
