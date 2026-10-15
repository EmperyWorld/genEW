"""Identity admin BFF routes — proxy roles/user management to identity_service."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request

from services.empery_control_center_api.src.core.identity_bff_use_cases import (
    EccIdentityBffUseCases,
)
from services.empery_control_center_api.src.data.schemas import (
    EccAssignRoleRequest,
    EccAssignRoleResponse,
    EccRoleListResponse,
    EccUserSummary,
)

router = APIRouter(prefix="/identity", tags=["identity"])


def _identity_uc(request: Request) -> EccIdentityBffUseCases:
    return request.app.state.container.resolve("ecc_identity_bff_use_cases")


@router.get("/roles", response_model=EccRoleListResponse)
async def list_roles(request: Request) -> EccRoleListResponse:
    return await _identity_uc(request).list_roles(
        request.headers.get("Authorization")
    )


@router.get("/users/lookup", response_model=EccUserSummary)
async def lookup_user_by_email(request: Request, email: str) -> EccUserSummary:
    """Resolve Identity user by email (must be registered before /users/{id})."""
    return await _identity_uc(request).lookup_user_by_email(
        email, request.headers.get("Authorization")
    )


@router.get("/users/{user_id}", response_model=EccUserSummary)
async def get_user(user_id: UUID, request: Request) -> EccUserSummary:
    return await _identity_uc(request).get_user(
        user_id, request.headers.get("Authorization")
    )


@router.post(
    "/users/{user_id}/roles",
    response_model=EccAssignRoleResponse,
)
async def assign_role(
    user_id: UUID,
    payload: EccAssignRoleRequest,
    request: Request,
) -> EccAssignRoleResponse:
    return await _identity_uc(request).assign_role(
        user_id, payload, request.headers.get("Authorization")
    )
