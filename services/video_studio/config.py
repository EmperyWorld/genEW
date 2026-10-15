"""Configuration for video_studio."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _csv_env(key: str, default: str) -> list[str]:
    raw = os.environ.get(key, default)
    return [part.strip() for part in raw.split(",") if part.strip()]


class ServiceConfig(BaseModel):
    service_name: str = Field(default="video_studio")
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8022)
    log_level: str = Field(default="INFO")
    comfy_base_url: str = Field(
        default="http://192.168.1.136:31003",
        description="ComfyUI HTTP base (COMFY_BASE_URL)",
    )
    workflow_path: str = Field(
        default="",
        description="Path to image_to_video.json; empty = package workflows/",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ],
    )
    comfy_timeout_seconds: float = Field(default=120.0)
    default_length: int = Field(default=81, ge=5, le=161)


def default_workflow_path() -> Path:
    return Path(__file__).resolve().parent / "workflows" / "image_to_video.json"


@lru_cache
def get_config() -> ServiceConfig:
    wf = _env("VIDEO_STUDIO_WORKFLOW_PATH", "").strip()
    return ServiceConfig(
        host=_env("VIDEO_STUDIO_HOST", "0.0.0.0"),
        port=int(_env("VIDEO_STUDIO_PORT", _env("PORT", "8022"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        comfy_base_url=_env(
            "COMFY_BASE_URL",
            "http://192.168.1.136:31003",
        )
        .strip()
        .rstrip("/"),
        workflow_path=wf or str(default_workflow_path()),
        cors_origins=_csv_env(
            "VIDEO_STUDIO_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174",
        ),
        comfy_timeout_seconds=float(_env("COMFY_TIMEOUT_SECONDS", "120")),
        default_length=int(_env("VIDEO_STUDIO_DEFAULT_LENGTH", "81")),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
