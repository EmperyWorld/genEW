"""Immutable core domain entities for task_orchestrator_service."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TaskStatus(str, Enum):
    """Kanban workflow column."""

    BACKLOG = "backlog"
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class TaskPriority(str, Enum):
    """Task priority levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class Task(BaseModel):
    """Immutable Kanban task entity."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    title: str
    description: str | None = None
    status: TaskStatus
    priority: TaskPriority
    assignee_id: UUID | None = None
    created_by: UUID
    updated_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class VerifiedIdentity(BaseModel):
    """Result of successful token verification (immutable)."""

    model_config = ConfigDict(frozen=True)

    user_id: UUID
    email: str | None = None
    token_jti: str | None = None
