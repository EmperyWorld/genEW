"""Immutable Atom domain models (Pydantic V2)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AtomKind(str, Enum):
    ARCHITECT_DECISION = "architect_decision"
    VERIFIER_REPORT = "verifier_report"
    SELF_DOC_PROPOSAL = "self_doc_proposal"
    SELF_DOC_APPLY = "self_doc_apply"
    CONTEXT_NOTE = "context_note"


class AtomProvenance(BaseModel):
    model_config = ConfigDict(frozen=True)

    source: str
    artifact_path: str | None = None
    job_id: str | None = None
    service_name: str | None = None
    session_id: str | None = None


class Atom(BaseModel):
    """Frozen atomic knowledge unit. Embeddings stay in the repository layer."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    kind: AtomKind
    title: str
    body: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    provenance: AtomProvenance
    created_at: datetime
    content_hash: str
    embedding_dims: int | None = None
    archived_at: datetime | None = None


class DocProposalStatus(str, Enum):
    PENDING = "pending"
    APPLIED = "applied"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class DocProposal(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    target_relative_path: str
    title: str
    rationale: str
    content_mode: str
    proposed_content: str
    base_sha256: str | None = None
    status: DocProposalStatus
    proposal_file_path: str
    atom_id: UUID | None = None
    created_at: datetime
    applied_at: datetime | None = None
    applied_by: str | None = None
