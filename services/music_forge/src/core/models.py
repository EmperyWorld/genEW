"""Domain models for music_forge (Pydantic boundaries)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000, description="Caption / style intent")
    lyrics: str = Field(default="", max_length=12000)
    instrumental: bool = Field(default=True)
    duration: int | None = Field(default=None, ge=5, le=300)
    bpm: int | None = Field(default=None, ge=40, le=240)
    steps: int | None = Field(default=None, ge=4, le=100)
    seed: int | None = Field(default=None, ge=0)


class GenerateResponse(BaseModel):
    prompt_id: str
    status: Literal["queued"] = "queued"
    run_id: str | None = None


class AudioRef(BaseModel):
    filename: str
    subfolder: str = ""
    type: str = "output"


class JobStatus(BaseModel):
    prompt_id: str
    status: Literal["queued", "running", "completed", "failed"]
    error: str | None = None
    audio: list[AudioRef] = Field(default_factory=list)
    raw_status: dict[str, Any] = Field(default_factory=dict)
