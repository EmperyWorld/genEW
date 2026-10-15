"""Auth BFF routes — proxy login/me to identity_service."""

from __future__ import annotations

from fastapi import APIRouter, Request

from services.empery_control_center_api.src.core.auth_use_cases import EccAuthUseCases
from services.empery_control_center_api.src.data.schemas import (
    EccLoginRequest,
    EccLoginResponse,
    EccLogoutResponse,
    EccPasswordResetConfirmRequest,
    EccPasswordResetConfirmResponse,
    EccPasswordResetRequest,
    EccPasswordResetRequestResponse,
    EccRegisterRequest,
    EccRegisterResponse,
    EccUserSummary,
)

router = APIRouter(tags=["auth"])


def _auth_uc(request: Request) -> EccAuthUseCases:
    return request.app.state.container.resolve("ecc_auth_use_cases")


@router.post(
    "/auth/register",
    response_model=EccRegisterResponse,
    status_code=201,
)
async def auth_register(
    payload: EccRegisterRequest, request: Request
) -> EccRegisterResponse:
    return await _auth_uc(request).register(payload)


@router.post("/auth/login", response_model=EccLoginResponse)
async def auth_login(payload: EccLoginRequest, request: Request) -> EccLoginResponse:
    return await _auth_uc(request).login(payload)


@router.post("/auth/logout", response_model=EccLogoutResponse)
async def auth_logout(request: Request) -> EccLogoutResponse:
    return await _auth_uc(request).logout()


@router.get("/auth/me", response_model=EccUserSummary)
async def auth_me(request: Request) -> EccUserSummary:
    return await _auth_uc(request).me(request.headers.get("Authorization"))


@router.post(
    "/auth/password-reset/request",
    response_model=EccPasswordResetRequestResponse,
)
async def password_reset_request(
    payload: EccPasswordResetRequest, request: Request
) -> EccPasswordResetRequestResponse:
    return await _auth_uc(request).request_password_reset(payload)


@router.post(
    "/auth/password-reset/confirm",
    response_model=EccPasswordResetConfirmResponse,
)
async def password_reset_confirm(
    payload: EccPasswordResetConfirmRequest, request: Request
) -> EccPasswordResetConfirmResponse:
    return await _auth_uc(request).confirm_password_reset(payload)
