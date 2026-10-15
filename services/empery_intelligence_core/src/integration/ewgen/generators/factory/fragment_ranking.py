"""
Fragment importance ranking — semantic priority for CAG snippet selection.
"""

from __future__ import annotations

import re
from enum import IntEnum
from typing import List

from .context_knowledge import ContextSnippet

CONTRACT_SYMBOLS = frozenset({"api_response_format", "ApiResponse", "ResponseEnvelope"})


class FragmentTier(IntEnum):
    """Lower value = higher priority (included first under budget pressure)."""

    CONTRACT = 1
    INTERFACE = 2
    TYPE_ALIAS = 3
    SERVICE_CLASS = 4
    ROUTE = 5
    IMPLEMENTATION = 6
    IMPORT_BARREL = 7


def classify_fragment(snippet: ContextSnippet) -> FragmentTier:
    path = snippet.path.lower()
    content = snippet.content
    symbols = set(snippet.symbols)

    if symbols & CONTRACT_SYMBOLS or "api_response_format" in content:
        return FragmentTier.CONTRACT
    if path.endswith("index.ts") and content.count("export ") >= 3 and "interface" not in content:
        return FragmentTier.IMPORT_BARREL
    if "/types/" in path or path.endswith(".d.ts") or "interface " in content:
        return FragmentTier.INTERFACE
    if re.search(r"export\s+type\s+\w+", content):
        return FragmentTier.TYPE_ALIAS
    if any(name.endswith(("Repository", "Service")) for name in symbols):
        return FragmentTier.SERVICE_CLASS
    if any(str(symbol).startswith("/") for symbol in symbols):
        return FragmentTier.ROUTE
    return FragmentTier.IMPLEMENTATION


def apply_importance_metadata(snippet: ContextSnippet) -> ContextSnippet:
    tier = classify_fragment(snippet)
    bonus = {
        FragmentTier.CONTRACT: 8.0,
        FragmentTier.INTERFACE: 6.0,
        FragmentTier.TYPE_ALIAS: 5.0,
        FragmentTier.SERVICE_CLASS: 4.0,
        FragmentTier.ROUTE: 3.0,
        FragmentTier.IMPLEMENTATION: 1.0,
        FragmentTier.IMPORT_BARREL: 0.5,
    }[tier]
    return snippet.model_copy(
        update={
            "importance_tier": int(tier),
            "relevance_score": snippet.relevance_score + bonus,
        },
    )


def rank_snippets(snippets: List[ContextSnippet]) -> List[ContextSnippet]:
    """
    Rank snippets for packing: contracts/interfaces first, import barrels last.
    """
    enriched = [apply_importance_metadata(snippet) for snippet in snippets]
    return sorted(
        enriched,
        key=lambda item: (
            item.importance_tier,
            -item.relevance_score,
            len(item.content),
        ),
    )


def impact_from_tier(tier: int) -> "ImpactLevel":
    """Map fragment tier (1=highest) to impact level for SDG pruning."""
    from .context_knowledge import ImpactLevel  # noqa: PLC0415

    try:
        fragment_tier = FragmentTier(tier)
    except ValueError:
        return ImpactLevel.LOW

    if fragment_tier in {FragmentTier.CONTRACT, FragmentTier.INTERFACE}:
        return ImpactLevel.HIGH
    if fragment_tier in {FragmentTier.TYPE_ALIAS, FragmentTier.SERVICE_CLASS}:
        return ImpactLevel.MEDIUM
    return ImpactLevel.LOW
