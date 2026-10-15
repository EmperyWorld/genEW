"""FastAPI routers for identity_service."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Request

from services.identity_service.src.api.deps import extract_bearer_token, resolve_principal
from services.identity_service.src.core.use_cases import IdentityUseCases
from services.identity_service.src.data.schemas import (
    AssignRoleRequest,
    AssignRoleResponse,
    HealthResponse,
    IntrospectRequest,
    IntrospectResponse,
    LoginRequest,
    LoginResponse,
    PasswordResetConfirmRequest,
    PasswordResetConfirmResponse,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    RegisterRequest,
    RegisterResponse,
    RoleListResponse,
    UserResponse,
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


@router.post("/auth/register", response_model=RegisterResponse, status_code=201)
async def register(payload: RegisterRequest, request: Request) -> RegisterResponse:
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    return await use_cases.register(payload)


@router.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request) -> LoginResponse:
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    return await use_cases.login(payload)


@router.post(
    "/auth/password-reset/request",
    response_model=PasswordResetRequestResponse,
)
async def password_reset_request(
    payload: PasswordResetRequest,
    request: Request,
) -> PasswordResetRequestResponse:
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    return await use_cases.request_password_reset(payload)


@router.post(
    "/auth/password-reset/confirm",
    response_model=PasswordResetConfirmResponse,
)
async def password_reset_confirm(
    payload: PasswordResetConfirmRequest,
    request: Request,
) -> PasswordResetConfirmResponse:
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    return await use_cases.confirm_password_reset(payload)


@router.post("/auth/introspect", response_model=IntrospectResponse)
async def introspect(
    request: Request,
    payload: IntrospectRequest | None = None,
) -> IntrospectResponse:
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    body = payload or IntrospectRequest()
    bearer = extract_bearer_token(request, required=False)
    return await use_cases.introspect(body, bearer)


@router.get("/auth/me", response_model=UserResponse)
async def me(request: Request) -> UserResponse:
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    principal = resolve_principal(request)
    return await use_cases.me(principal)


@router.get("/users/lookup", response_model=UserResponse)
async def lookup_user_by_email(
    request: Request,
    email: str,
) -> UserResponse:
    """Resolve a user by email (admin/operator users:read). Must precede /users/{id}."""
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    principal = resolve_principal(request)
    return await use_cases.get_user_by_email(email, principal)


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: UUID, request: Request) -> UserResponse:
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    principal = resolve_principal(request)
    return await use_cases.get_user(user_id, principal)


@router.post("/users/{user_id}/roles", response_model=AssignRoleResponse)
async def assign_role(
    user_id: UUID,
    payload: AssignRoleRequest,
    request: Request,
) -> AssignRoleResponse:
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    principal = resolve_principal(request)
    return await use_cases.assign_role(user_id, payload, principal)


@router.get("/roles", response_model=RoleListResponse)
async def list_roles(request: Request) -> RoleListResponse:
    use_cases: IdentityUseCases = request.app.state.container.resolve(
        "identity_use_cases"
    )
    principal = resolve_principal(request)
    return await use_cases.list_roles(principal)
