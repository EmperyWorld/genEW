"""Ports for dedmoroz companion chat."""

from __future__ import annotations

from typing import Protocol

from services.dedmoroz.src.core.models import ChatMessage


class ChatStorePort(Protocol):
    async def append(self, role: str, content: str) -> ChatMessage: ...

    async def list(self, *, limit: int = 50) -> list[ChatMessage]: ...
