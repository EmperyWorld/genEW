"""Identity admin BFF use cases — roles and user lookup via identity HTTP adapter."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from core.container import ServiceContainer
from services.empery_control_center_api.src.data.schemas import (
    EccAssignRoleRequest,
    EccAssignRoleResponse,
    EccRoleItem,
    EccRoleListResponse,
    EccUserSummary,
)


class EccIdentityBffUseCases:
    """Orchestrates ECC identity admin BFF operations."""

    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _client(self):
        return self._container.resolve("identity_client")

    @staticmethod
    def _user_summary(raw: dict[str, Any]) -> EccUserSummary:
        user = raw.get("user") or raw
        return EccUserSummary.model_validate(user)

    async def list_roles(self, authorization: str | None) -> EccRoleListResponse:
        data = await self._client().list_roles(authorization)
        roles = [EccRoleItem.model_validate(r) for r in data.get("roles", [])]
        return EccRoleListResponse(roles=roles)

    async def get_user(
        self, user_id: UUID, authorization: str | None
    ) -> EccUserSummary:
        data = await self._client().get_user(user_id, authorization)
        return self._user_summary(data)

    async def lookup_user_by_email(
        self, email: str, authorization: str | None
    ) -> EccUserSummary:
        data = await self._client().lookup_user_by_email(email, authorization)
        return self._user_summary(data)

    async def assign_role(
        self,
        user_id: UUID,
        payload: EccAssignRoleRequest,
        authorization: str | None,
    ) -> EccAssignRoleResponse:
        data = await self._client().assign_role(
            user_id, payload.role, authorization
        )
        return EccAssignRoleResponse(user=self._user_summary(data))
