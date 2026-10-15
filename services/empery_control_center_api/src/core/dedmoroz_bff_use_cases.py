"""BFF use cases for dedmoroz chat."""

from __future__ import annotations

from core.container import ServiceContainer

from services.empery_control_center_api.src.data.dedmoroz_schemas import (
    EccMessageListResponse,
    EccMessageView,
    EccSendMessageRequest,
)


class EccDedmorozBffUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _client(self):
        return self._container.resolve("dedmoroz_client")

    async def list_messages(
        self, authorization: str | None, *, limit: int = 50
    ) -> EccMessageListResponse:
        raw = await self._client().list_messages(authorization, limit=limit)
        msgs = [
            EccMessageView.model_validate(m) for m in (raw.get("messages") or [])
        ]
        return EccMessageListResponse(
            messages=msgs, count=int(raw.get("count") or len(msgs))
        )

    async def send_message(
        self, authorization: str | None, body: EccSendMessageRequest
    ) -> EccMessageView:
        raw = await self._client().send_message(
            authorization, content=body.content
        )
        return EccMessageView.model_validate(raw)
