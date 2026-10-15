"""FastAPI routers for task_orchestrator_service."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Query, Request

from services.task_orchestrator_service.src.api.deps import get_bearer_authorization
from services.task_orchestrator_service.src.core.models import TaskStatus
from services.task_orchestrator_service.src.core.use_cases import TaskUseCases
from services.task_orchestrator_service.src.data.schemas import (
    AssignTaskRequest,
    CreateTaskRequest,
    HealthResponse,
    TaskListResponse,
    TaskResponse,
    UpdateTaskRequest,
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


@router.post("/tasks", response_model=TaskResponse, status_code=201)
async def create_task(
    payload: CreateTaskRequest,
    request: Request,
) -> TaskResponse:
    use_cases: TaskUseCases = request.app.state.container.resolve("task_use_cases")
    return await use_cases.create_task(
        payload,
        authorization=get_bearer_authorization(request),
    )


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    status: TaskStatus | None = Query(default=None),
    assignee_id: UUID | None = Query(default=None),
) -> TaskListResponse:
    use_cases: TaskUseCases = request.app.state.container.resolve("task_use_cases")
    return await use_cases.list_tasks(
        limit=limit,
        status=status,
        assignee_id=assignee_id,
    )


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: UUID, request: Request) -> TaskResponse:
    use_cases: TaskUseCases = request.app.state.container.resolve("task_use_cases")
    return await use_cases.get_task(task_id)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    payload: UpdateTaskRequest,
    request: Request,
) -> TaskResponse:
    use_cases: TaskUseCases = request.app.state.container.resolve("task_use_cases")
    return await use_cases.update_task(
        task_id,
        payload,
        authorization=get_bearer_authorization(request),
    )


@router.post("/tasks/{task_id}/assign", response_model=TaskResponse)
async def assign_task(
    task_id: UUID,
    payload: AssignTaskRequest,
    request: Request,
) -> TaskResponse:
    use_cases: TaskUseCases = request.app.state.container.resolve("task_use_cases")
    return await use_cases.assign_task(
        task_id,
        payload,
        authorization=get_bearer_authorization(request),
    )
