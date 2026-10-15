"""In-memory draft store for site_studio previews (no persistent DB yet)."""

from __future__ import annotations

from dataclasses import dataclass
from threading import Lock


@dataclass
class DraftRecord:
    draft_id: str
    title: str
    topic: str
    brief: str
    html: str
    backend: str
    model: str | None


class DraftRepository:
    def __init__(self) -> None:
        self._lock = Lock()
        self._items: dict[str, DraftRecord] = {}

    def save(self, record: DraftRecord) -> DraftRecord:
        with self._lock:
            self._items[record.draft_id] = record
            return record

    def get(self, draft_id: str) -> DraftRecord | None:
        with self._lock:
            return self._items.get(draft_id)

    def list_recent(self, *, limit: int = 20) -> list[DraftRecord]:
        with self._lock:
            items = list(self._items.values())
        return list(reversed(items[-limit:]))
