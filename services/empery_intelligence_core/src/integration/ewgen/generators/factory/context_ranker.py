"""
ContextRanker — graph distance + contract-type impact scoring with budget packing.
"""

from __future__ import annotations

from typing import List, Optional, Set

from pydantic import BaseModel, Field

from .context_knowledge import ContextSnippet, ContextWindow, ImpactLevel
from .context_pruner import ContextPruner
from .dependency_graph import DependencyGraph
from .fragment_ranking import FragmentTier, classify_fragment
from .graph_impact import NodeImpactProfile, analyze_graph_impact, select_nodes_within_budget
from .knowledge_injection import DEFAULT_TOKEN_BUDGET, SUFFIX_RESERVE_MAX, SUFFIX_RESERVE_MIN, build_context_window


CONTRACT_TIER_BONUS: dict[FragmentTier, float] = {
    FragmentTier.CONTRACT: 3.0,
    FragmentTier.INTERFACE: 2.5,
    FragmentTier.TYPE_ALIAS: 1.75,
    FragmentTier.SERVICE_CLASS: 1.25,
    FragmentTier.ROUTE: 1.0,
    FragmentTier.IMPLEMENTATION: 0.35,
    FragmentTier.IMPORT_BARREL: 0.15,
}


class SnippetImpactScore(BaseModel):
    """Budget-ranking score for a context fragment."""

    node_id: str
    source_id: str
    path: str
    impact_score: float = 0.0
    graph_distance: int = 0
    contract_tier: int = Field(default=6, description="FragmentTier value — lower is higher priority")
    impact_level: ImpactLevel = ImpactLevel.MEDIUM
    reasons: List[str] = Field(default_factory=list)


class ContextRanker:
    """
    Rank snippets by SDG graph distance and contract type, then pack under token budget.

    Wraps ContextPruner with explicit ImpactScore exposure for observability.
    """

    def compute_impact_scores(
        self,
        snippets: List[ContextSnippet],
        *,
        target_module: str,
        direct_dependencies: List[str],
        graph: Optional[DependencyGraph] = None,
    ) -> List[SnippetImpactScore]:
        if not snippets:
            return []

        sdg = graph or DependencyGraph.from_snippets(
            snippets,
            target_module=target_module,
            direct_dependencies=direct_dependencies,
        )
        snippets_by_node: dict[str, ContextSnippet] = {}
        for snippet in snippets:
            node_id = snippet.node_id or f"{snippet.source_id}:{snippet.path}"
            snippets_by_node[node_id] = snippet

        profiles = analyze_graph_impact(
            sdg,
            target_module=target_module,
            direct_dependencies=direct_dependencies,
            snippets_by_node=snippets_by_node,
        )

        scores: List[SnippetImpactScore] = []
        for snippet in snippets:
            node_id = snippet.node_id or f"{snippet.source_id}:{snippet.path}"
            profile = profiles.get(node_id)
            tier = classify_fragment(snippet)
            tier_bonus = CONTRACT_TIER_BONUS.get(tier, 0.0)
            graph_score = profile.score if profile else 0.0
            graph_distance = profile.graph_distance if profile else 999
            impact_level = profile.impact_level if profile else ImpactLevel.MEDIUM
            reasons = list(profile.reasons) if profile else []
            if tier_bonus >= 2.0:
                reasons.append(f"contract tier={tier.name.lower()}")

            scores.append(
                SnippetImpactScore(
                    node_id=node_id,
                    source_id=snippet.source_id,
                    path=snippet.path,
                    impact_score=graph_score + tier_bonus,
                    graph_distance=graph_distance,
                    contract_tier=int(tier),
                    impact_level=impact_level,
                    reasons=reasons,
                ),
            )

        scores.sort(key=lambda item: (-item.impact_score, item.graph_distance, item.contract_tier))
        return scores

    def rank_and_pack(
        self,
        snippets: List[ContextSnippet],
        *,
        target_module: str,
        direct_dependencies: List[str],
        token_budget: Optional[int] = None,
        module_type: Optional[str] = None,
    ) -> ContextWindow:
        budget = token_budget if token_budget is not None else DEFAULT_TOKEN_BUDGET
        if not snippets:
            return ContextWindow(token_budget=budget)

        sdg = DependencyGraph.from_snippets(
            snippets,
            target_module=target_module,
            direct_dependencies=direct_dependencies,
        )
        suffix_reserve = min(
            SUFFIX_RESERVE_MAX,
            max(SUFFIX_RESERVE_MIN, budget // 6),
        )

        selected, selected_ids, profiles = select_nodes_within_budget(
            sdg,
            snippets,
            target_module=target_module,
            direct_dependencies=direct_dependencies,
            token_budget=budget,
            suffix_reserve=suffix_reserve,
        )

        if not selected:
            selected = list(snippets)

        relationship_summary = sdg.relationship_lines(
            target_module,
            selected_ids,
            profiles,
        )

        return build_context_window(
            selected,
            token_budget=budget,
            module_type=module_type,
            dependency_graph=sdg,
            selected_node_ids=selected_ids,
            target_module=target_module,
            preserve_order=True,
            preselected=True,
            impact_profiles=profiles,
            relationship_summary=relationship_summary,
        )

    def prune(
        self,
        snippets: List[ContextSnippet],
        *,
        target_module: str,
        direct_dependencies: List[str],
        token_budget: int,
        module_type: Optional[str] = None,
    ) -> ContextWindow:
        """Compatibility alias — prefer rank_and_pack for new code."""
        return self.rank_and_pack(
            snippets,
            target_module=target_module,
            direct_dependencies=direct_dependencies,
            token_budget=token_budget,
            module_type=module_type,
        )


_default_ranker: Optional[ContextRanker] = None


def get_context_ranker() -> ContextRanker:
    global _default_ranker
    if _default_ranker is None:
        _default_ranker = ContextRanker()
    return _default_ranker
