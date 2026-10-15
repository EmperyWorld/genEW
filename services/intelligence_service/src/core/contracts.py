"""Interface contracts for the intelligence service provider pattern."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.intelligence_service.src.core.models import TaskInsight


class TaskInsightRequest(BaseModel):
    """Local AI analysis request mapped onto AIProvider.complete_chat."""

    model_config = ConfigDict(frozen=True)

    task_id: UUID
    title: str
    description: str = ""
    current_priority: str | None = None
    assignee_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskInsightResponse(BaseModel):
    """Local AI analysis response parsed from AIChatResponse content."""

    model_config = ConfigDict(frozen=True)

    suggested_priority: str
    suggested_deadline: datetime | None = None
    summary: str
    confidence: float = Field(ge=0.0, le=1.0)
    provider: str
    raw: dict[str, Any] = Field(default_factory=dict)


class InsightRepositoryPort(Protocol):
    """Data-access contract resolved via ServiceContainer."""

    async def upsert_insight(self, insight: TaskInsight) -> TaskInsight: ...

    async def get_by_task_id(self, task_id: UUID) -> TaskInsight | None: ...
