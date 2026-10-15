"""FastAPI routes for EIC Knowledge Memory (/api/v1/memory/*)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from services.empery_intelligence_core.src.core.memory.context_pack import (
    ContextPackService,
)
from services.empery_intelligence_core.src.core.memory.doc_use_cases import DocUseCases
from services.empery_intelligence_core.src.core.memory.models import AtomKind
from services.empery_intelligence_core.src.core.memory.use_cases import MemoryUseCases
from services.empery_intelligence_core.src.data.memory.schemas import (
    AtomListResponse,
    AtomResponse,
    ContextPackRequest,
    ContextPackResponse,
    CreateAtomRequest,
    DocApplyRequest,
    DocApplyResponse,
    DocProposalListResponse,
    DocProposalRequest,
    DocProposalResponse,
    IngestArchitectRequest,
    IngestVerifierRequest,
    RetrieveRequest,
    RetrieveResponse,
)

router = APIRouter(prefix="/api/v1/memory", tags=["memory"])


def _memory(request: Request) -> MemoryUseCases:
    return request.app.state.container.resolve("eic_memory_use_cases")


def _context(request: Request) -> ContextPackService:
    return request.app.state.container.resolve("eic_context_pack")


def _docs(request: Request) -> DocUseCases:
    return request.app.state.container.resolve("eic_doc_use_cases")


@router.post("/atoms", response_model=AtomResponse)
async def create_atom(payload: CreateAtomRequest, request: Request) -> AtomResponse:
    return await _memory(request).create_atom(payload)


@router.post("/atoms/ingest/architect", response_model=AtomResponse)
async def ingest_architect(
    payload: IngestArchitectRequest,
    request: Request,
) -> AtomResponse:
    return await _memory(request).ingest_architect(payload)


@router.post("/atoms/ingest/verifier", response_model=AtomResponse)
async def ingest_verifier(
    payload: IngestVerifierRequest,
    request: Request,
) -> AtomResponse:
    return await _memory(request).ingest_verifier(payload)


@router.get("/atoms/{atom_id}", response_model=AtomResponse)
async def get_atom(atom_id: UUID, request: Request) -> AtomResponse:
    return await _memory(request).get_atom(atom_id)


@router.get("/atoms", response_model=AtomListResponse)
async def list_atoms(
    request: Request,
    kind: AtomKind | None = None,
    service_name: str | None = None,
    tag: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> AtomListResponse:
    atoms = await _memory(request).list_atoms(
        kind=kind,
        service_name=service_name,
        tag=tag,
        limit=limit,
    )
    return AtomListResponse(atoms=atoms, count=len(atoms))


@router.delete("/atoms/{atom_id}", status_code=204)
async def archive_atom(atom_id: UUID, request: Request) -> None:
    await _memory(request).archive_atom(atom_id)


@router.post("/retrieve", response_model=RetrieveResponse)
async def retrieve(payload: RetrieveRequest, request: Request) -> RetrieveResponse:
    return await _memory(request).retrieve(payload)


@router.post("/context", response_model=ContextPackResponse)
async def context_pack(
    payload: ContextPackRequest,
    request: Request,
) -> ContextPackResponse:
    return await _context(request).build_context(
        query=payload.query,
        stage=payload.stage,
        service_name=payload.service_name,
        kinds=payload.kinds,
        limit=payload.limit,
        token_budget=payload.token_budget,
    )


@router.post("/docs/proposals", response_model=DocProposalResponse)
async def create_proposal(
    payload: DocProposalRequest,
    request: Request,
) -> DocProposalResponse:
    return await _docs(request).create_proposal(payload)


@router.get("/docs/proposals", response_model=DocProposalListResponse)
async def list_proposals(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> DocProposalListResponse:
    proposals = await _docs(request).list_proposals(limit=limit)
    return DocProposalListResponse(proposals=proposals, count=len(proposals))


@router.get("/docs/proposals/{proposal_id}", response_model=DocProposalResponse)
async def get_proposal(proposal_id: UUID, request: Request) -> DocProposalResponse:
    return await _docs(request).get_proposal(proposal_id)


@router.post(
    "/docs/proposals/{proposal_id}/apply",
    response_model=DocApplyResponse,
)
async def apply_proposal(
    proposal_id: UUID,
    payload: DocApplyRequest,
    request: Request,
) -> DocApplyResponse:
    return await _docs(request).apply_proposal(
        proposal_id,
        confirm=payload.confirm,
        apply_rules=payload.apply_rules,
    )
