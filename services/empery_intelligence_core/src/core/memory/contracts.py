"""Memory ports (interface contracts) for DI resolution."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from services.empery_intelligence_core.src.core.memory.models import (
    Atom,
    AtomKind,
    DocProposal,
)


class AtomStorePort(Protocol):
    async def upsert_atom(
        self,
        atom: Atom,
        *,
        embedding: bytes | None = None,
        dedupe: bool = True,
    ) -> Atom: ...

    async def get_atom(self, atom_id: UUID) -> Atom | None: ...

    async def list_atoms(
        self,
        *,
        kind: AtomKind | None = None,
        service_name: str | None = None,
        tag: str | None = None,
        limit: int = 50,
        include_archived: bool = False,
    ) -> list[Atom]: ...

    async def soft_archive(self, atom_id: UUID) -> Atom | None: ...

    async def candidate_filter(
        self,
        *,
        kinds: list[AtomKind] | None = None,
        service_name: str | None = None,
        tags: list[str] | None = None,
        limit: int = 200,
    ) -> list[Atom]: ...

    async def get_embedding(self, atom_id: UUID) -> bytes | None: ...

    async def fts_search(
        self,
        query: str,
        *,
        kinds: list[AtomKind] | None = None,
        service_name: str | None = None,
        limit: int = 32,
    ) -> list[tuple[Atom, float]]: ...

    def ensure_schema(self) -> None: ...


class EmbeddingPort(Protocol):
    def embed(self, text: str) -> list[float]: ...

    @property
    def dims(self) -> int: ...


class ContextPackPort(Protocol):
    async def build_context(
        self,
        *,
        query: str,
        stage: str = "plan",
        service_name: str | None = None,
        kinds: list[AtomKind] | None = None,
        limit: int | None = None,
        token_budget: int | None = None,
    ) -> dict[str, Any]: ...


class OrchestrationFsPort(Protocol):
    def resolve_repo_root(self) -> Any: ...

    def validate_propose_path(self, target_relative_path: str) -> str: ...

    def is_rules_path(self, target_relative_path: str) -> bool: ...

    def proposals_dir(self) -> Any: ...

    def read_text(self, relative_path: str) -> str | None: ...

    def file_sha256(self, relative_path: str) -> str | None: ...

    def atomic_write(self, relative_path: str, content: str) -> None: ...

    def write_proposal_files(
        self,
        proposal_id: str,
        *,
        meta: dict[str, Any],
        markdown: str,
        content: str,
    ) -> str: ...


class DocProposalPort(Protocol):
    async def create_proposal(self, request: Any) -> DocProposal: ...

    async def list_proposals(self, *, limit: int = 50) -> list[DocProposal]: ...

    async def get_proposal(self, proposal_id: UUID) -> DocProposal | None: ...

    async def apply_proposal(
        self,
        proposal_id: UUID,
        *,
        confirm: bool,
        apply_rules: bool = False,
        applied_by: str | None = None,
    ) -> dict[str, Any]: ...


class MemorySearchPort(Protocol):
    """Facade for ECC / autonomous memory search."""

    async def search(
        self,
        query: str,
        *,
        kinds: list[AtomKind] | None = None,
        service_name: str | None = None,
        tags: list[str] | None = None,
        limit: int = 8,
        mode: str = "hybrid",
    ) -> dict[str, Any]: ...
