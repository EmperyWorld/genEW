"""Ports for ai_chat companion chat."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from services.ai_chat.src.core.models import ChatMessage


class ChatStorePort(Protocol):
    async def append(
        self,
        role: str,
        content: str,
        *,
        user_id: UUID | None = None,
        session_id: UUID | None = None,
    ) -> ChatMessage: ...

    async def list(
        self,
        *,
        limit: int = 50,
        user_id: UUID | None = None,
    ) -> list[ChatMessage]: ...
