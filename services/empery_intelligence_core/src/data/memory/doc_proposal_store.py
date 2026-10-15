"""Persistence for reviewable self-documentation proposals."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select

from core.data.database import DatabaseManager
from core.logging import log_event
from services.empery_intelligence_core.src.core.memory.models import (
    DocProposal,
    DocProposalStatus,
)
from services.empery_intelligence_core.src.data.memory.orm import DocProposalRow


class DocProposalStore:
    """DB-backed doc proposal rows (on-disk mirror handled by OrchestrationFs)."""

    def __init__(self, database: DatabaseManager, logger: logging.Logger) -> None:
        self._db = database
        self._logger = logger

    def _to_model(self, row: DocProposalRow) -> DocProposal:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        applied = row.applied_at
        if applied is not None and applied.tzinfo is None:
            applied = applied.replace(tzinfo=timezone.utc)
        return DocProposal(
            id=row.id,  # type: ignore[arg-type]
            target_relative_path=row.target_relative_path,
            title=row.title,
            rationale=row.rationale,
            content_mode=row.content_mode,
            proposed_content=row.proposed_content,
            base_sha256=row.base_sha256,
            status=DocProposalStatus(row.status),
            proposal_file_path=row.proposal_file_path,
            atom_id=row.atom_id,  # type: ignore[arg-type]
            created_at=created,
            applied_at=applied,
            applied_by=row.applied_by,
        )

    async def create(self, proposal: DocProposal) -> DocProposal:
        with self._db.session_scope() as session:
            row = DocProposalRow(
                id=proposal.id,
                target_relative_path=proposal.target_relative_path,
                title=proposal.title,
                rationale=proposal.rationale,
                content_mode=proposal.content_mode,
                proposed_content=proposal.proposed_content,
                base_sha256=proposal.base_sha256,
                status=proposal.status.value,
                proposal_file_path=proposal.proposal_file_path,
                atom_id=proposal.atom_id,
                created_at=proposal.created_at,
                applied_at=proposal.applied_at,
                applied_by=proposal.applied_by,
            )
            session.add(row)
            session.flush()
            saved = self._to_model(row)
        log_event(
            self._logger,
            event="eic.memory.doc.proposed",
            message="Doc proposal stored",
            proposal_id=str(saved.id),
            target=saved.target_relative_path,
        )
        return saved

    async def get(self, proposal_id: UUID) -> DocProposal | None:
        with self._db.session_scope() as session:
            row = session.get(DocProposalRow, proposal_id)
            if row is None:
                return None
            return self._to_model(row)

    async def list(self, *, limit: int = 50) -> list[DocProposal]:
        with self._db.session_scope() as session:
            rows = session.scalars(
                select(DocProposalRow)
                .order_by(DocProposalRow.created_at.desc())
                .limit(limit)
            ).all()
            return [self._to_model(r) for r in rows]

    async def mark_applied(
        self,
        proposal_id: UUID,
        *,
        applied_by: str | None = None,
    ) -> DocProposal | None:
        now = datetime.now(timezone.utc)
        with self._db.session_scope() as session:
            row = session.get(DocProposalRow, proposal_id)
            if row is None:
                return None
            row.status = DocProposalStatus.APPLIED.value
            row.applied_at = now
            row.applied_by = applied_by
            session.flush()
            return self._to_model(row)
