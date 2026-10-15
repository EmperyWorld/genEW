"""P1.3 memory hooks + SOURCE-focused context pack."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from core.logging import configure_logging
from services.empery_intelligence_core.src.core.memory.context_pack import (
    ContextPackService,
)
from services.empery_intelligence_core.src.core.memory.models import AtomKind
from services.empery_intelligence_core.src.core.memory.settings import MemoryConfig
from services.empery_intelligence_core.src.core.memory.use_cases import MemoryUseCases
from services.empery_intelligence_core.src.data.memory.schemas import (
    RetrieveRequest,
    AtomResponse,
    ContextPackResponse,
    RetrieveResponse,
)


class _FakeRepo:
    def __init__(self) -> None:
        self.atoms: list = []

    async def upsert_atom(self, atom, embedding=None, dedupe=True):
        self.atoms.append(atom)
        return atom

    async def get_atom(self, atom_id):
        return None


@pytest.mark.asyncio
async def test_record_verify_report_ingests_passed() -> None:
    repo = _FakeRepo()
    emb = MagicMock()
    emb.embed = MagicMock(return_value=[0.1] * 8)
    emb.dims = 8
    cfg = MemoryConfig(embedding_backend="none", embedding_dims=8)
    uc = MemoryUseCases(
        repository=repo,  # type: ignore[arg-type]
        embedding=emb,
        event_bus=None,
        config=cfg,
        logger=configure_logging("mem"),
    )
    intention = SimpleNamespace(
        id="job-1",
        service_name="demo_svc",
        checkpoint=SimpleNamespace(report_path="reports/demo_verify.md"),
    )
    resp = await uc.record_verify_report(
        intention, status="PASSED", summary="all green"
    )
    assert isinstance(resp, AtomResponse)
    assert resp.kind == AtomKind.VERIFIER_REPORT
    assert resp.metadata.get("verify_status") == "PASSED"
    assert len(repo.atoms) == 1


@pytest.mark.asyncio
async def test_context_pack_prefers_source_md(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = Path(__file__).resolve().parents[3]
    # Use real SOURCE when available via repo_root
    cfg = MemoryConfig(
        embedding_backend="none",
        embedding_dims=8,
        repo_root=str(root),
        context_token_budget=2000,
    )
    memory = MagicMock()

    async def _retrieve(req):
        return RetrieveResponse(query=req.query, results=[], mode="hybrid")

    memory.retrieve = _retrieve
    svc = ContextPackService(
        memory_use_cases=memory,  # type: ignore[arg-type]
        config=cfg,
        logger=configure_logging("ctx"),
    )
    pack = await svc.build_context(
        query="create companion chat service",
        stage="implement",
        service_name="p1_ctx",
    )
    assert isinstance(pack, ContextPackResponse)
    assert "Recipe SOURCE" in pack.formatted_context or "SOURCE" in pack.formatted_context


@pytest.mark.asyncio
async def test_record_verify_report_includes_assembly() -> None:
    repo = _FakeRepo()
    emb = MagicMock()
    emb.embed = MagicMock(return_value=[0.1] * 8)
    emb.dims = 8
    cfg = MemoryConfig(embedding_backend="none", embedding_dims=8)
    uc = MemoryUseCases(
        repository=repo,  # type: ignore[arg-type]
        embedding=emb,
        event_bus=None,
        config=cfg,
        logger=configure_logging("mem_asm"),
    )
    intention = SimpleNamespace(
        id="job-p13",
        service_name="p13_mem_svc",
        metadata={
            "scaffold_profile": "music_forge",
            "recipe_packs": ["music_forge", "service_anatomy"],
            "eic_atom_file_count": 11,
            "eic_extract_adapt_count": 2,
        },
        checkpoint=SimpleNamespace(report_path=None, design_path=None),
    )
    resp = await uc.record_verify_report(
        intention, status="PASSED", summary="ok factory"
    )
    assert resp.metadata.get("recipe_packs") == ["music_forge", "service_anatomy"]
    assert resp.metadata.get("scaffold_profile") == "music_forge"
    assert resp.metadata.get("eic_atom_file_count") == 11
    assert resp.metadata.get("eic_extract_adapt_count") == 2
    assert "Assembly:" in resp.body
    assert "music_forge" in resp.body
    assert len(repo.atoms) == 1
