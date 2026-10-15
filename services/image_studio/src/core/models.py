"""Domain models for image_studio (Pydantic boundaries)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    width: int = Field(default=1024, ge=64, le=2048)
    height: int = Field(default=1024, ge=64, le=2048)
    seed: int | None = Field(default=None, ge=0)


class GenerateResponse(BaseModel):
    prompt_id: str
    status: Literal["queued"] = "queued"


class ImageRef(BaseModel):
    filename: str
    subfolder: str = ""
    type: str = "output"


class JobStatus(BaseModel):
    prompt_id: str
    status: Literal["queued", "running", "completed", "failed"]
    error: str | None = None
    images: list[ImageRef] = Field(default_factory=list)
    raw_status: dict[str, Any] = Field(default_factory=dict)
