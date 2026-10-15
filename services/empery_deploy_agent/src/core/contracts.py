"""Pydantic contracts for the deploy-agent allowlist API."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DeployAction(str, Enum):
    UP = "up"
    BUILD = "build"
    # UI bake: build (layer cache) then up --force-recreate (Hands Desktop/ECC refresh).
    REBUILD = "rebuild"
    # Volume-mounted Python services (ECC API): restart process without recreate.
    RESTART = "restart"
    PS = "ps"
    HEALTH = "health"
    STOP = "stop"


class DeployRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    service_name: str = Field(..., min_length=2, max_length=63)
    action: DeployAction = DeployAction.UP
    health_url: str | None = Field(
        default=None,
        description="Optional absolute URL for action=health (http/https only)",
    )

    @field_validator("service_name")
    @classmethod
    def _service_name(cls, value: str) -> str:
        import re

        if not re.fullmatch(r"[a-z][a-z0-9_]{1,62}", value):
            raise ValueError("service_name must match ^[a-z][a-z0-9_]{1,62}$")
        return value


class DeployResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    ok: bool
    action: DeployAction
    service_name: str
    argv: list[str] = Field(default_factory=list)
    exit_code: int | None = None
    output: str = ""
    error: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str
    service: str
    workspace: str
    socket_ok: bool
    container_host: str
    details: dict[str, Any] = Field(default_factory=dict)
