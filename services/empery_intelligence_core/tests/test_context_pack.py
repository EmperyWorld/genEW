"""Context pack budget + stage preference tests."""

from __future__ import annotations

import pytest

from services.empery_intelligence_core.src.core.memory.models import AtomKind
from services.empery_intelligence_core.src.data.memory.schemas import (
    IngestArchitectRequest,
    IngestVerifierRequest,
)


@pytest.mark.asyncio
async def test_budget_truncation(wired_container) -> None:
    memory = wired_container.resolve("eic_memory_use_cases")
    pack = wired_container.resolve("eic_context_pack")

    for i in range(6):
        await memory.ingest_architect(
            IngestArchitectRequest(
                service_name="pack_svc",
                title=f"Decision {i}",
                decision_summary=("Long decision text about architecture. " * 40) + str(i),
                constraints=["c"],
                design_paths=[f"designs/d{i}.md"],
            )
        )

    result = await pack.build_context(
        query="architecture decision",
        stage="plan",
        service_name="pack_svc",
        limit=6,
        token_budget=400,
    )
    assert result.truncated is True
    assert result.budget_used <= 400
    assert "EIC Memory Context (plan)" in result.formatted_context


@pytest.mark.asyncio
async def test_implement_prefers_failed_verifier(wired_container) -> None:
    memory = wired_container.resolve("eic_memory_use_cases")
    pack = wired_container.resolve("eic_context_pack")

    await memory.ingest_architect(
        IngestArchitectRequest(
            service_name="pref_svc",
            title="Happy path design",
            decision_summary="Use hybrid retrieval for memory context packs",
        )
    )
    await memory.ingest_verifier(
        IngestVerifierRequest(
            service_name="pref_svc",
            title="Gate failed",
            verify_status="FAILED",
            summary="Missing registry registration for memory providers",
            violations=["registry"],
            required_fixes=["register eic_memory providers"],
        )
    )

    result = await pack.build_context(
        query="registry memory providers",
        stage="implement",
        service_name="pref_svc",
        limit=4,
        token_budget=2000,
    )
    assert result.atoms
    assert result.atoms[0].atom.kind == AtomKind.VERIFIER_REPORT
    assert result.atoms[0].atom.metadata.get("verify_status") == "FAILED"
