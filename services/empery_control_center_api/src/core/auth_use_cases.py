"""Auth BFF use cases — login/logout/me via identity HTTP adapter."""

from __future__ import annotations

from typing import Any

from core.container import ServiceContainer
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


class EccAuthUseCases:
    """Orchestrates ECC auth BFF operations."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _client(self):
        return self._container.resolve("identity_client")

    @staticmethod
    def _user_summary(raw: dict[str, Any]) -> EccUserSummary:
        user = raw.get("user") or raw
        return EccUserSummary.model_validate(user)

    async def register(self, payload: EccRegisterRequest) -> EccRegisterResponse:
        data = await self._client().register(
            payload.email,
            payload.password,
            payload.display_name,
        )
        return EccRegisterResponse(user=self._user_summary(data))

    async def login(self, payload: EccLoginRequest) -> EccLoginResponse:
        data = await self._client().login(payload.email, payload.password)
        return EccLoginResponse(
            access_token=data["access_token"],
            token_type=data.get("token_type", "bearer"),
            expires_in=int(data["expires_in"]),
            user=self._user_summary(data),
        )

    async def me(self, authorization: str | None) -> EccUserSummary:
        data = await self._client().me(authorization)
        return self._user_summary(data)

    async def logout(self) -> EccLogoutResponse:
        # Stateless JWT — client clears token; optional Identity revoke is Phase B.
        return EccLogoutResponse(ok=True)

    async def request_password_reset(
        self, payload: EccPasswordResetRequest
    ) -> EccPasswordResetRequestResponse:
        data = await self._client().request_password_reset(payload.email)
        return EccPasswordResetRequestResponse(
            ok=bool(data.get("ok", True)),
            message=data.get("message"),
            reset_token=data.get("reset_token"),
        )

    async def confirm_password_reset(
        self, payload: EccPasswordResetConfirmRequest
    ) -> EccPasswordResetConfirmResponse:
        await self._client().confirm_password_reset(
            payload.token, payload.new_password
        )
        return EccPasswordResetConfirmResponse(ok=True)
