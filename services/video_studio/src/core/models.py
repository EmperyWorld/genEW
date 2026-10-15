"""Domain models for video_studio (Pydantic boundaries)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GenerateResponse(BaseModel):
    prompt_id: str
    status: Literal["queued"] = "queued"
    run_id: str | None = None


class VideoRef(BaseModel):
    filename: str
    subfolder: str = ""
    type: str = "output"


class JobStatus(BaseModel):
    prompt_id: str
    status: Literal["queued", "running", "completed", "failed"]
    error: str | None = None
    videos: list[VideoRef] = Field(default_factory=list)
    raw_status: dict[str, Any] = Field(default_factory=dict)
