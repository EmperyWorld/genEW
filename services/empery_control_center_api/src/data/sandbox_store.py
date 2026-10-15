"""In-memory sandbox session store for interaction probes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Literal
from uuid import UUID, uuid4


SandboxStatus = Literal["ready", "probing", "closed"]


@dataclass
class SandboxSession:
    session_id: UUID
    status: SandboxStatus
    created_at: datetime
    probe_count: int = 0


class SandboxSessionStore:
    """Process-local session registry (stateless FE resumes via session_id)."""

    def __init__(self) -> None:
        self._sessions: dict[UUID, SandboxSession] = {}
        self._lock = Lock()

    def create(self) -> SandboxSession:
        session = SandboxSession(
            session_id=uuid4(),
            status="ready",
            created_at=datetime.now(timezone.utc),
        )
        with self._lock:
            self._sessions[session.session_id] = session
        return session

    def get(self, session_id: UUID) -> SandboxSession | None:
        with self._lock:
            return self._sessions.get(session_id)

    def mark_probing(self, session_id: UUID) -> SandboxSession | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None or session.status == "closed":
                return None
            session.status = "probing"
            session.probe_count += 1
            return session

    def mark_ready(self, session_id: UUID) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is not None and session.status != "closed":
                session.status = "ready"
