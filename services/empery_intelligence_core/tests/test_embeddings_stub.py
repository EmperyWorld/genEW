"""Deterministic embedding stub tests."""

from __future__ import annotations

from services.empery_intelligence_core.src.integration.memory.embeddings_stub import (
    EmbeddingStub,
    cosine_similarity,
)


def test_deterministic_dims_and_stability() -> None:
    stub = EmbeddingStub(dims=64)
    a = stub.embed("sqlite atom store for architect decisions")
    b = stub.embed("sqlite atom store for architect decisions")
    assert len(a) == 64
    assert a == b


def test_cosine_ranking_related_strings() -> None:
    stub = EmbeddingStub(dims=128)
    query = stub.embed("architect decision sqlite memory")
    related = stub.embed("architect chose sqlite for long term memory atoms")
    unrelated = stub.embed("completely different topic about cooking pasta recipes")
    assert cosine_similarity(query, related) > cosine_similarity(query, unrelated)
