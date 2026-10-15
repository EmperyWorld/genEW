"""Domain models for site_studio (Pydantic boundaries)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PreviewRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=400)
    brief: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="ru", max_length=16)


class PreviewResponse(BaseModel):
    draft_id: str
    title: str
    topic: str
    html: str
    backend: str = ""
    model: str | None = None
    status: Literal["ready"] = "ready"


class DraftSummary(BaseModel):
    draft_id: str
    title: str
    topic: str
    status: Literal["ready"] = "ready"
