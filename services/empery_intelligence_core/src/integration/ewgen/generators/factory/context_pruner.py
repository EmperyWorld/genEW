"""
ContextPruner — budget-bounded SDG traversal with graph-derived impact.
"""

from __future__ import annotations

from typing import List, Optional, Set

from .context_knowledge import ContextSnippet, ContextWindow, ImpactLevel
from .dependency_graph import DependencyGraph
from .graph_impact import select_nodes_within_budget
from .knowledge_injection import DEFAULT_TOKEN_BUDGET, SUFFIX_RESERVE_MAX, SUFFIX_RESERVE_MIN, build_context_window
from .smart_truncation import validate_structural_integrity


class ContextPruner:
    """
    Pack context by traversing the SDG until the token budget is exhausted.

    Traversal has no arbitrary node cap — ``token_budget`` is the sole limiter.
    ImpactLevel is derived from graph topology (``graph_impact.analyze_graph_impact``),
    not scavenger static labels.
    """

    def prune(
        self,
        snippets: List[ContextSnippet],
        *,
        target_module: str,
        direct_dependencies: List[str],
        token_budget: int,
        module_type: Optional[str] = None,
        graph: Optional[DependencyGraph] = None,
    ) -> ContextWindow:
        if not snippets:
            return ContextWindow(token_budget=token_budget)

        sdg = graph or DependencyGraph.from_snippets(
            snippets,
            target_module=target_module,
            direct_dependencies=direct_dependencies,
        )

        suffix_reserve = min(
            SUFFIX_RESERVE_MAX,
            max(SUFFIX_RESERVE_MIN, token_budget // 6),
        )

        selected, selected_ids, profiles = select_nodes_within_budget(
            sdg,
            snippets,
            target_module=target_module,
            direct_dependencies=direct_dependencies,
            token_budget=token_budget,
            suffix_reserve=suffix_reserve,
        )

        if not selected:
            selected = list(snippets)

        relationship_summary = sdg.relationship_lines(
            target_module,
            selected_ids,
            profiles,
        )

        window = build_context_window(
            selected,
            token_budget=token_budget,
            module_type=module_type,
            dependency_graph=sdg,
            selected_node_ids=selected_ids,
            target_module=target_module,
            preserve_order=True,
            preselected=True,
            impact_profiles=profiles,
            relationship_summary=relationship_summary,
        )
        return window


def assert_pruned_integrity(window: ContextWindow) -> bool:
    """True when every packed snippet is structurally valid."""
    return all(
        validate_structural_integrity(snippet.content, snippet.language)
        for snippet in window.snippets
    )


def is_high_impact(snippet: ContextSnippet) -> bool:
    return snippet.impact_level == ImpactLevel.HIGH
