"""AtomRepository persistence tests (sqlite)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from services.empery_intelligence_core.src.core.memory.models import (
    Atom,
    AtomKind,
    AtomProvenance,
)
from services.empery_intelligence_core.src.core.memory.use_cases import (
    canonical_content_hash,
)
from services.empery_intelligence_core.src.integration.memory.embeddings_stub import (
    EmbeddingStub,
    pack_embedding,
    unpack_embedding,
)


@pytest.mark.asyncio
async def test_insert_get_list_and_dedupe(wired_container) -> None:
    repo = wired_container.resolve("eic_atom_repository")
    body = "Architect chose SQLite for atom storage"
    meta = {"approach": "sqlite"}
    content_hash = canonical_content_hash(body=body, metadata=meta)
    vec = EmbeddingStub(dims=64).embed(body)
    blob = pack_embedding(vec)

    atom = Atom(
        id=uuid4(),
        kind=AtomKind.ARCHITECT_DECISION,
        title="SQLite decision",
        body=body,
        metadata=meta,
        tags=["architect", "eic"],
        provenance=AtomProvenance(source="architect", service_name="eic_memory"),
        created_at=datetime.now(timezone.utc),
        content_hash=content_hash,
        embedding_dims=64,
    )
    saved = await repo.upsert_atom(atom, embedding=blob)
    assert saved.id == atom.id

    again = await repo.upsert_atom(
        Atom(
            id=uuid4(),
            kind=AtomKind.ARCHITECT_DECISION,
            title="SQLite decision copy",
            body=body,
            metadata=meta,
            tags=["architect"],
            provenance=AtomProvenance(source="architect", service_name="eic_memory"),
            created_at=datetime.now(timezone.utc),
            content_hash=content_hash,
            embedding_dims=64,
        ),
        embedding=blob,
    )
    assert again.id == saved.id

    got = await repo.get_atom(saved.id)
    assert got is not None
    assert got.title == "SQLite decision"

    listed = await repo.list_atoms(kind=AtomKind.ARCHITECT_DECISION, service_name="eic_memory")
    assert len(listed) == 1

    emb = await repo.get_embedding(saved.id)
    assert emb is not None
    assert unpack_embedding(emb) == pytest.approx(vec, abs=1e-5)


@pytest.mark.asyncio
async def test_soft_archive_and_fts(wired_container) -> None:
    repo = wired_container.resolve("eic_atom_repository")
    stub = EmbeddingStub(dims=64)
    body = "Verifier failed because registry registration was missing"
    atom = Atom(
        id=uuid4(),
        kind=AtomKind.VERIFIER_REPORT,
        title="Missing registry",
        body=body,
        metadata={"verify_status": "FAILED"},
        tags=["verifier"],
        provenance=AtomProvenance(source="verifier", service_name="demo_svc"),
        created_at=datetime.now(timezone.utc),
        content_hash=canonical_content_hash(body=body, metadata={"verify_status": "FAILED"}),
        embedding_dims=64,
    )
    saved = await repo.upsert_atom(atom, embedding=pack_embedding(stub.embed(body)))

    hits = await repo.fts_search("registry registration", service_name="demo_svc", limit=5)
    assert any(a.id == saved.id for a, _ in hits)

    archived = await repo.soft_archive(saved.id)
    assert archived is not None
    assert archived.archived_at is not None

    active = await repo.list_atoms(service_name="demo_svc")
    assert active == []

    hits_after = await repo.fts_search("registry", service_name="demo_svc", limit=5)
    assert all(a.id != saved.id for a, _ in hits_after)
