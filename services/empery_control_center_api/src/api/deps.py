"""Request helpers for container resolution."""

from __future__ import annotations

from fastapi import Request

from core.container import ServiceContainer
from services.empery_control_center_api.src.core.use_cases import EccUseCases


def get_container(request: Request) -> ServiceContainer:
    return request.app.state.container


def get_use_cases(request: Request) -> EccUseCases:
    return request.app.state.container.resolve("ecc_use_cases")
