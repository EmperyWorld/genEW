"""API request/response schemas (Pydantic V2)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.intelligence_service.src.core.models import TaskInsight


class AnalyzeTaskRequest(BaseModel):
    """Manual insight analysis trigger payload."""

    model_config = ConfigDict(frozen=True)

    task_id: UUID
    title: str = Field(min_length=1, max_length=512)
    description: str = ""
    priority: str | None = Field(default=None, max_length=32)
    assignee_id: UUID | None = None


class InsightResponse(BaseModel):
    """Successful insight lookup / analyze payload."""

    model_config = ConfigDict(frozen=True)

    insight: TaskInsight


class HealthResponse(BaseModel):
    """Service health contract."""

    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    version: str
    features: list[str]
    database_ready: bool = False
    ai_ready: bool = False
