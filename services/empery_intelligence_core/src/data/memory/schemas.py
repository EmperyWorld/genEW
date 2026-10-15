"""API request/response schemas for EIC memory."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from services.empery_intelligence_core.src.core.memory.models import AtomKind, AtomProvenance


class AtomResponse(BaseModel):
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


class AtomListResponse(BaseModel):
    atoms: list[AtomResponse]
    count: int


class CreateAtomRequest(BaseModel):
    kind: AtomKind
    title: str = Field(min_length=1, max_length=240)
    body: str = Field(min_length=1, max_length=100_000)
    metadata: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    provenance: AtomProvenance


class IngestArchitectRequest(BaseModel):
    service_name: str
    title: str
    decision_summary: str
    constraints: list[str] = Field(default_factory=list)
    design_paths: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    job_id: str | None = None
    artifact_path: str | None = None


class IngestVerifierRequest(BaseModel):
    service_name: str
    title: str
    verify_status: Literal["PASSED", "FAILED", "UNKNOWN"]
    summary: str
    violations: list[str] = Field(default_factory=list)
    required_fixes: list[str] = Field(default_factory=list)
    report_path: str | None = None
    job_id: str | None = None
    # P13 factory memory — next Plan retrieves these via service_name filter.
    recipe_packs: list[str] = Field(default_factory=list)
    scaffold_profile: str | None = None
    atom_file_count: int | None = None
    extract_adapt_count: int | None = None


class RetrieveRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    kinds: list[AtomKind] | None = None
    service_name: str | None = None
    tags: list[str] | None = None
    limit: int = Field(default=8, ge=1, le=32)
    mode: Literal["hybrid", "embedding", "fts"] = "hybrid"


class RetrievedAtom(BaseModel):
    atom: AtomResponse
    score: float
    match_reason: str


class RetrieveResponse(BaseModel):
    query: str
    results: list[RetrievedAtom]
    mode: str


class ContextPackRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    stage: Literal["reason", "plan", "implement", "verify", "evolve"] = "plan"
    service_name: str | None = None
    kinds: list[AtomKind] | None = None
    limit: int | None = Field(default=None, ge=1, le=32)
    token_budget: int | None = Field(default=None, ge=64, le=50_000)


class ContextPackResponse(BaseModel):
    query: str
    stage: str
    atoms: list[RetrievedAtom]
    formatted_context: str
    truncated: bool
    budget_used: int


class DocProposalRequest(BaseModel):
    target_relative_path: str
    title: str = Field(min_length=1, max_length=240)
    rationale: str = Field(min_length=1, max_length=20_000)
    proposed_content: str = Field(min_length=1, max_length=500_000)
    content_mode: Literal["full_file", "unified_diff"] = "full_file"
    base_sha256: str | None = None


class DocProposalResponse(BaseModel):
    id: UUID
    target_relative_path: str
    title: str
    rationale: str
    content_mode: str
    proposed_content: str
    base_sha256: str | None = None
    status: str
    proposal_file_path: str
    atom_id: UUID | None = None
    created_at: datetime
    applied_at: datetime | None = None
    applied_by: str | None = None


class DocProposalListResponse(BaseModel):
    proposals: list[DocProposalResponse]
    count: int


class DocApplyRequest(BaseModel):
    confirm: Literal[True]
    apply_rules: bool = False


class DocApplyResponse(BaseModel):
    proposal_id: UUID
    target_relative_path: str
    status: str
    apply_atom_id: UUID | None = None
