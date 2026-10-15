"""In-memory chat store for dedmoroz unit tests only."""

from __future__ import annotations

from services.dedmoroz.src.core.models import ChatMessage


class InMemoryChatStore:
    def __init__(self) -> None:
        self._messages: list[ChatMessage] = []

    async def append(self, role: str, content: str) -> ChatMessage:
        msg = ChatMessage(role=role, content=content)
        self._messages.append(msg)
        return msg

    async def list(self, *, limit: int = 50) -> list[ChatMessage]:
        return self._messages[-limit:]
