"""FastAPI routers for core_auth_service."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Request

from services.core_auth_service.src.core.use_cases import AuthUseCases
from services.core_auth_service.src.data.schemas import (
    ChatAssistRequest,
    ChatAssistResponse,
    HealthResponse,
    LoginRequest,
    LoginResponse,
    ProfileResponse,
    RegisterRequest,
    RegisterResponse,
)

router = APIRouter()


def _load_manifest() -> dict:
    manifest_path = Path(__file__).resolve().parents[2] / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    manifest = _load_manifest()
    database_ready = False
    container = request.app.state.container
    if container.has("postgres_adapter"):
        try:
            await container.resolve("postgres_adapter").ensure_ready()
            database_ready = True
        except Exception:  # noqa: BLE001 — health must not raise
            database_ready = False
    return HealthResponse(
        status="ok",
        service=manifest["name"],
        version=manifest["version"],
        features=manifest.get("features", []),
        database_ready=database_ready,
    )


@router.post("/auth/register", response_model=RegisterResponse)
async def register(payload: RegisterRequest, request: Request) -> RegisterResponse:
    use_cases: AuthUseCases = request.app.state.container.resolve("auth_use_cases")
    return await use_cases.register(payload)


@router.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request) -> LoginResponse:
    use_cases: AuthUseCases = request.app.state.container.resolve("auth_use_cases")
    return await use_cases.login(payload)


@router.get("/auth/users/{user_id}/profile", response_model=ProfileResponse)
async def get_profile(user_id: UUID, request: Request) -> ProfileResponse:
    use_cases: AuthUseCases = request.app.state.container.resolve("auth_use_cases")
    profile = await use_cases.get_profile(user_id)
    return ProfileResponse(profile=profile)


@router.post("/auth/chat", response_model=ChatAssistResponse)
async def chat_assist(
    payload: ChatAssistRequest,
    request: Request,
) -> ChatAssistResponse:
    use_cases: AuthUseCases = request.app.state.container.resolve("auth_use_cases")
    return await use_cases.chat_assist(payload)
