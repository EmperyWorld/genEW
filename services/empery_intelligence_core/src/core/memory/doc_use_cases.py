"""Self-documentation proposal / apply use cases."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from core.errors import ServiceError, StandardizedErrorResponse
from core.event_bus import Event, EventBus
from core.logging import log_event
from services.empery_intelligence_core.src.core.memory.doc_safety import assert_apply_gates
from services.empery_intelligence_core.src.core.memory.models import (
    AtomKind,
    AtomProvenance,
    DocProposal,
    DocProposalStatus,
)
from services.empery_intelligence_core.src.core.memory.settings import MemoryConfig
from services.empery_intelligence_core.src.core.memory.use_cases import MemoryUseCases
from services.empery_intelligence_core.src.data.memory.doc_proposal_store import (
    DocProposalStore,
)
from services.empery_intelligence_core.src.data.memory.repository import AtomRepository
from services.empery_intelligence_core.src.data.memory.schemas import (
    CreateAtomRequest,
    DocApplyResponse,
    DocProposalRequest,
    DocProposalResponse,
)
from services.empery_intelligence_core.src.integration.memory.orchestration_fs import (
    OrchestrationFs,
)


def proposal_to_response(proposal: DocProposal) -> DocProposalResponse:
    return DocProposalResponse(
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


class DocUseCases:
    def __init__(
        self,
        *,
        store: DocProposalStore,
        atom_repository: AtomRepository,
        orchestration_fs: OrchestrationFs,
        memory_use_cases: MemoryUseCases,
        config: MemoryConfig,
        logger: logging.Logger,
        event_bus: EventBus | None = None,
    ) -> None:
        self._store = store
        self._atoms = atom_repository
        self._fs = orchestration_fs
        self._memory = memory_use_cases
        self._config = config
        self._logger = logger
        self._event_bus = event_bus

    async def _publish(self, name: str, payload: dict[str, Any]) -> None:
        if self._event_bus is None:
            return
        await self._event_bus.publish(Event(name=name, payload=payload))

    async def create_proposal(self, request: DocProposalRequest) -> DocProposalResponse:
        target = self._fs.validate_propose_path(request.target_relative_path)
        proposal_id = uuid4()
        created_at = datetime.now(timezone.utc)

        markdown = (
            f"# Proposal: {request.title}\n\n"
            f"**Target:** `{target}`\n\n"
            f"**Mode:** {request.content_mode}\n\n"
            f"## Rationale\n\n{request.rationale}\n\n"
            f"## Preview\n\n```\n{request.proposed_content[:4000]}\n```\n"
        )
        meta = {
            "id": str(proposal_id),
            "target_relative_path": target,
            "title": request.title,
            "rationale": request.rationale,
            "content_mode": request.content_mode,
            "base_sha256": request.base_sha256,
            "status": DocProposalStatus.PENDING.value,
            "created_at": created_at.isoformat(),
        }
        proposal_file_path = self._fs.write_proposal_files(
            str(proposal_id),
            meta=meta,
            markdown=markdown,
            content=request.proposed_content,
        )

        atom_resp = await self._memory.create_atom(
            CreateAtomRequest(
                kind=AtomKind.SELF_DOC_PROPOSAL,
                title=request.title,
                body=f"Proposal for {target}\n\n{request.rationale}",
                metadata={
                    "proposal_id": str(proposal_id),
                    "target_relative_path": target,
                    "content_mode": request.content_mode,
                },
                tags=["self_doc", "proposal"],
                provenance=AtomProvenance(
                    source="eic.self_doc",
                    artifact_path=proposal_file_path,
                    service_name=None,
                ),
            )
        )

        proposal = DocProposal(
            id=proposal_id,
            target_relative_path=target,
            title=request.title,
            rationale=request.rationale,
            content_mode=request.content_mode,
            proposed_content=request.proposed_content,
            base_sha256=request.base_sha256,
            status=DocProposalStatus.PENDING,
            proposal_file_path=proposal_file_path,
            atom_id=atom_resp.id,
            created_at=created_at,
        )
        saved = await self._store.create(proposal)
        await self._publish(
            "eic.memory.doc.proposed",
            {
                "proposal_id": str(saved.id),
                "target_relative_path": saved.target_relative_path,
            },
        )
        return proposal_to_response(saved)

    async def list_proposals(self, *, limit: int = 50) -> list[DocProposalResponse]:
        rows = await self._store.list(limit=limit)
        return [proposal_to_response(r) for r in rows]

    async def get_proposal(self, proposal_id: UUID) -> DocProposalResponse:
        proposal = await self._store.get(proposal_id)
        if proposal is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MEMORY_NOT_FOUND",
                    message="Doc proposal not found",
                    details={"proposal_id": str(proposal_id)},
                ),
                http_status=404,
            )
        return proposal_to_response(proposal)

    async def apply_proposal(
        self,
        proposal_id: UUID,
        *,
        confirm: bool,
        apply_rules: bool = False,
        applied_by: str | None = None,
    ) -> DocApplyResponse:
        proposal = await self._store.get(proposal_id)
        if proposal is None:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MEMORY_NOT_FOUND",
                    message="Doc proposal not found",
                    details={"proposal_id": str(proposal_id)},
                ),
                http_status=404,
            )
        if proposal.status != DocProposalStatus.PENDING:
            raise ServiceError(
                StandardizedErrorResponse(
                    error_code="EIC_MEMORY_CONFLICT_HASH",
                    message="Proposal is not in pending status",
                    details={"status": proposal.status.value},
                ),
                http_status=409,
            )

        target = assert_apply_gates(
            allow_doc_apply=self._config.allow_doc_apply,
            allow_rules_apply=self._config.allow_rules_apply,
            apply_rules=apply_rules,
            confirm=confirm,
            target_relative_path=proposal.target_relative_path,
        )

        if proposal.base_sha256:
            current = self._fs.file_sha256(target)
            if current != proposal.base_sha256:
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_MEMORY_CONFLICT_HASH",
                        message="base_sha256 does not match current file content",
                        details={
                            "expected": proposal.base_sha256,
                            "actual": current,
                        },
                    ),
                    http_status=409,
                )

        content = proposal.proposed_content
        if proposal.content_mode == "unified_diff":
            # v0.1: unified_diff apply writes the proposed_content as-is only when
            # it does not look like a patch header — otherwise reject for safety.
            if content.lstrip().startswith("diff ") or content.lstrip().startswith("--- "):
                raise ServiceError(
                    StandardizedErrorResponse(
                        error_code="EIC_MEMORY_INVALID_PATH",
                        message=(
                            "unified_diff apply is not supported in v0.1; "
                            "use content_mode=full_file"
                        ),
                    ),
                    http_status=400,
                )

        self._fs.atomic_write(target, content)
        updated = await self._store.mark_applied(proposal_id, applied_by=applied_by)
        assert updated is not None

        apply_atom = await self._memory.create_atom(
            CreateAtomRequest(
                kind=AtomKind.SELF_DOC_APPLY,
                title=f"Applied: {proposal.title}",
                body=f"Applied proposal {proposal_id} to {target}",
                metadata={
                    "proposal_id": str(proposal_id),
                    "target_relative_path": target,
                },
                tags=["self_doc", "apply"],
                provenance=AtomProvenance(
                    source="eic.self_doc",
                    artifact_path=target,
                ),
            )
        )

        await self._publish(
            "eic.memory.doc.applied",
            {
                "proposal_id": str(proposal_id),
                "target_relative_path": target,
            },
        )
        log_event(
            self._logger,
            event="eic.memory.doc.applied",
            message="Doc proposal applied",
            proposal_id=str(proposal_id),
            target=target,
        )
        return DocApplyResponse(
            proposal_id=proposal_id,
            target_relative_path=target,
            status=updated.status.value,
            apply_atom_id=apply_atom.id,
        )
