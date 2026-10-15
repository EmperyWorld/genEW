"""
Graph-derived impact scoring for SDG nodes — not static scavenger labels.
"""

from __future__ import annotations

from typing import Dict, List, Set

from pydantic import BaseModel, Field

from .context_knowledge import ContextSnippet, ImpactLevel, estimate_tokens
from .dependency_graph import DependencyGraph, EdgeKind


class NodeImpactProfile(BaseModel):
    """Impact derived from graph position relative to the generation target."""

    node_id: str
    impact_level: ImpactLevel
    score: float = 0.0
    graph_distance: int = 0
    reasons: List[str] = Field(default_factory=list)
    is_downstream_dependent: bool = False
    is_upstream_dependency: bool = False
    on_contract_path: bool = False


def estimate_snippet_tokens(snippet: ContextSnippet) -> int:
    header = estimate_tokens(f"{snippet.path} {' '.join(snippet.symbols)}")
    return estimate_tokens(snippet.content) + header + 8


def structural_signal_bonus(snippet: ContextSnippet) -> float:
    """Contract-type modifier — graph topology is primary, syntax is secondary."""
    from .fragment_ranking import FragmentTier, classify_fragment  # noqa: PLC0415

    tier_bonus = {
        FragmentTier.CONTRACT: 2.0,
        FragmentTier.INTERFACE: 1.5,
        FragmentTier.TYPE_ALIAS: 1.0,
        FragmentTier.SERVICE_CLASS: 0.65,
        FragmentTier.ROUTE: 0.5,
        FragmentTier.IMPLEMENTATION: 0.2,
        FragmentTier.IMPORT_BARREL: 0.1,
    }
    bonus = tier_bonus.get(classify_fragment(snippet), 0.0)
    content = snippet.content
    path = snippet.path.lower()
    if "api_response_format" in content or "contract" in path:
        bonus += 0.5
    return bonus


def analyze_graph_impact(
    graph: DependencyGraph,
    *,
    target_module: str,
    direct_dependencies: List[str],
    snippets_by_node: Dict[str, ContextSnippet],
) -> Dict[str, NodeImpactProfile]:
    """
    Compute impact from SDG topology: distance, edge kinds, downstream/upstream role.

    Impact is NOT copied from scavenger static tiers — it reflects relationship
    to the module being generated.
    """
    target_key = target_module.strip().lower()
    target_node = f"target:{target_key}"
    dep_modules = {dep.strip().lower() for dep in direct_dependencies if dep.strip()}

    module_a_nodes = {
        node_id
        for node_id, node in graph.nodes.items()
        if node.module_id.lower() == target_key and not node_id.startswith("target:")
    }
    anchor_nodes: Set[str] = {target_node, *module_a_nodes}

    for dep in dep_modules:
        anchor_nodes.update(
            node_id
            for node_id, node in graph.nodes.items()
            if node.module_id.lower() == dep
        )

    distances = graph.distances_from_anchors(anchor_nodes)

    profiles: Dict[str, NodeImpactProfile] = {}
    for node_id, node in graph.nodes.items():
        if node_id.startswith("target:"):
            continue

        snippet = snippets_by_node.get(node_id)
        distance = distances.get(node_id, 999)
        score = 0.0
        reasons: List[str] = []

        downstream = _is_downstream_dependent(graph, node_id, anchor_nodes, target_key)
        upstream = _is_upstream_of_target(graph, node_id, anchor_nodes, dep_modules, target_key)

        if downstream:
            score += 6.0
            reasons.append("downstream module depends on generation target")
        if upstream:
            score += 4.5
            reasons.append("upstream dependency of target module")
        if node.module_id.lower() in dep_modules:
            score += 4.0
            reasons.append("explicit ComponentSpec dependency")

        if distance <= 1:
            score += 3.5
            reasons.append(f"graph distance {distance} from target anchor")
        elif distance <= 3:
            score += 2.0
            reasons.append(f"transitive graph distance {distance}")
        elif distance <= 6:
            score += 0.75
            reasons.append(f"distant transitive link (distance {distance})")

        for edge in graph.edges:
            if edge.source != node_id and edge.target != node_id:
                continue
            if edge.kind == EdgeKind.EXTENDS:
                score += 1.5
                reasons.append("extends edge on inheritance path")
            elif edge.kind == EdgeKind.IMPLEMENTS:
                score += 1.25
                reasons.append("implements shared interface")
            elif edge.kind == EdgeKind.REVERSE_DEPENDS:
                score += 2.0
                reasons.append("catalog reverse-dependency on target")
            elif edge.kind == EdgeKind.IMPORT and edge.target in anchor_nodes:
                score += 1.0
                reasons.append("imports target module surface")

        if snippet is not None:
            score += structural_signal_bonus(snippet)

        on_contract_path = downstream or (
            snippet is not None and ("interface " in snippet.content or "api_response_format" in snippet.content)
        )

        profiles[node_id] = NodeImpactProfile(
            node_id=node_id,
            impact_level=_score_to_level(score),
            score=score,
            graph_distance=distance if distance < 999 else -1,
            reasons=sorted(set(reasons)),
            is_downstream_dependent=downstream,
            is_upstream_dependency=upstream,
            on_contract_path=on_contract_path,
        )

    return profiles


def select_nodes_within_budget(
    graph: DependencyGraph,
    snippets: List[ContextSnippet],
    *,
    target_module: str,
    direct_dependencies: List[str],
    token_budget: int,
    suffix_reserve: int,
) -> tuple[List[ContextSnippet], Set[str], Dict[str, NodeImpactProfile]]:
    """
    Traverse the full SDG ordered by graph impact; pack until token budget fills.

    There is NO arbitrary node-count cap — only ``token_budget`` stops traversal.
    """
    snippets_by_node = {_node_id(snippet): snippet for snippet in snippets}
    profiles = analyze_graph_impact(
        graph,
        target_module=target_module,
        direct_dependencies=direct_dependencies,
        snippets_by_node=snippets_by_node,
    )

    ordered_node_ids = graph.rank_reachable_nodes(
        target_module,
        direct_dependencies,
        profiles,
    )

    snippet_budget = max(24, token_budget - suffix_reserve)
    selected: List[ContextSnippet] = []
    selected_ids: Set[str] = set()
    used = 0

    for node_id in ordered_node_ids:
        snippet = snippets_by_node.get(node_id)
        profile = profiles.get(node_id)
        if snippet is None or profile is None:
            continue

        cost = estimate_snippet_tokens(snippet)
        if used + cost > snippet_budget:
            continue

        enriched = snippet.model_copy(
            update={
                "impact_level": profile.impact_level,
                "source_file": snippet.path,
                "line_start": _line_start(snippet),
                "line_end": _line_end(snippet),
                "node_id": node_id,
                "relevance_score": snippet.relevance_score + profile.score,
            },
        )
        selected.append(enriched)
        selected_ids.add(node_id)
        used += cost

    return selected, selected_ids, profiles


def _node_id(snippet: ContextSnippet) -> str:
    return f"{snippet.source_id}:{snippet.path}"


def _score_to_level(score: float) -> ImpactLevel:
    if score >= 5.0:
        return ImpactLevel.HIGH
    if score >= 2.5:
        return ImpactLevel.MEDIUM
    return ImpactLevel.LOW


def _is_downstream_dependent(
    graph: DependencyGraph,
    node_id: str,
    anchor_nodes: Set[str],
    target_key: str,
) -> bool:
    for edge in graph.edges:
        if edge.source != node_id:
            continue
        if edge.kind == EdgeKind.REVERSE_DEPENDS and edge.target in anchor_nodes:
            return True
        if edge.target in anchor_nodes and edge.kind in {
            EdgeKind.IMPORT,
            EdgeKind.EXTENDS,
            EdgeKind.IMPLEMENTS,
        }:
            return True
    node = graph.nodes.get(node_id)
    if node and target_key in node.module_id.lower():
        return False
    return False


def _is_upstream_of_target(
    graph: DependencyGraph,
    node_id: str,
    anchor_nodes: Set[str],
    dep_modules: Set[str],
    target_key: str,
) -> bool:
    node = graph.nodes.get(node_id)
    if node is None:
        return False
    if node.module_id.lower() in dep_modules:
        return True
    for edge in graph.edges:
        if edge.source in anchor_nodes and edge.target == node_id:
            return True
        if edge.target in anchor_nodes and edge.source == node_id:
            return True
    return node.module_id.lower() != target_key


def _line_start(snippet: ContextSnippet) -> int:
    if not snippet.symbols:
        return 1
    primary = snippet.symbols[0]
    for index, line in enumerate(snippet.content.splitlines(), start=1):
        if primary in line:
            return index
    return 1


def _line_end(snippet: ContextSnippet) -> int:
    return max(_line_start(snippet), snippet.content.count("\n") + 1)
