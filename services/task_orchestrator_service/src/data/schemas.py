"""API request/response schemas (Pydantic V2)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from services.task_orchestrator_service.src.core.models import (
    Task,
    TaskPriority,
    TaskStatus,
)


class CreateTaskRequest(BaseModel):
    """Create a new Kanban task."""

    model_config = ConfigDict(frozen=True)

    title: str = Field(min_length=1, max_length=256)
    description: str | None = None
    status: TaskStatus = TaskStatus.BACKLOG
    priority: TaskPriority = TaskPriority.MEDIUM
    assignee_id: UUID | None = None


class UpdateTaskRequest(BaseModel):
    """Partial update of task fields / status."""

    model_config = ConfigDict(frozen=True)

    title: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> UpdateTaskRequest:
        if (
            self.title is None
            and self.description is None
            and self.status is None
            and self.priority is None
        ):
            raise ValueError("At least one field must be provided for update")
        return self


class AssignTaskRequest(BaseModel):
    """Assign or reassign a task."""

    model_config = ConfigDict(frozen=True)

    assignee_id: UUID


class TaskResponse(BaseModel):
    """Single task payload."""

    model_config = ConfigDict(frozen=True)

    task: Task


class TaskListResponse(BaseModel):
    """List of tasks."""

    model_config = ConfigDict(frozen=True)

    tasks: list[Task]
    count: int


class HealthResponse(BaseModel):
    """Service health contract."""

    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str]
    database_ready: bool = False
