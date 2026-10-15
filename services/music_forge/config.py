"""Configuration for music_forge."""

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
    service_name: str = Field(default="music_forge")
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8023)
    log_level: str = Field(default="INFO")
    comfy_base_url: str = Field(
        default="http://192.168.1.136:31003",
        description="ComfyUI HTTP base (COMFY_BASE_URL)",
    )
    workflow_path: str = Field(default="")
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ],
    )
    comfy_timeout_seconds: float = Field(default=120.0)
    default_duration: int = Field(default=45, ge=5, le=300)
    default_bpm: int = Field(default=112, ge=40, le=240)
    default_steps: int = Field(default=30, ge=4, le=100)


def default_workflow_path() -> Path:
    return Path(__file__).resolve().parent / "workflows" / "text_to_music.json"


@lru_cache
def get_config() -> ServiceConfig:
    wf = _env("MUSIC_FORGE_WORKFLOW_PATH", "").strip()
    return ServiceConfig(
        host=_env("MUSIC_FORGE_HOST", "0.0.0.0"),
        port=int(_env("MUSIC_FORGE_PORT", _env("PORT", "8023"))),
        log_level=_env("LOG_LEVEL", "INFO"),
        comfy_base_url=_env(
            "COMFY_BASE_URL",
            "http://192.168.1.136:31003",
        )
        .strip()
        .rstrip("/"),
        workflow_path=wf or str(default_workflow_path()),
        cors_origins=_csv_env(
            "MUSIC_FORGE_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174",
        ),
        comfy_timeout_seconds=float(_env("COMFY_TIMEOUT_SECONDS", "120")),
        default_duration=int(_env("MUSIC_FORGE_DEFAULT_DURATION", "45")),
        default_bpm=int(_env("MUSIC_FORGE_DEFAULT_BPM", "112")),
        default_steps=int(_env("MUSIC_FORGE_DEFAULT_STEPS", "30")),
    )


def clear_config_cache() -> None:
    get_config.cache_clear()
